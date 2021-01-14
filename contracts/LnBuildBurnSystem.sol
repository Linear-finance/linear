// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/ILnPrices.sol";
import "./LnAddressCache.sol";
import "./interfaces/ILnAsset.sol";
import "./interfaces/ILnDebtSystem.sol";
import "./interfaces/ILnCollateralSystem.sol";
import "./interfaces/ILnConfig.sol";

// 根据 LnCollateralSystem 的抵押资产计算相关抵押率，buildable lusd
contract LnBuildBurnSystem is LnAdmin, Pausable, LnAddressCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // -------------------------------------------------------
    // need set before system running value.
    ILnAsset private lUSDToken; // this contract need 

    ILnDebtSystem private debtSystem;
    ILnPrices private priceGetter;
    ILnCollateralSystem private collaterSys;
    ILnConfig private mConfig;
    // -------------------------------------------------------
    constructor(address admin, address _lUSDTokenAddr) public LnAdmin(admin) {
        lUSDToken = ILnAsset(_lUSDTokenAddr);
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    function updateAddressCache( ILnAddressStorage _addressStorage ) onlyAdmin public override
    {
        priceGetter =    ILnPrices( _addressStorage.getAddressWithRequire( "LnPrices",     "LnPrices address not valid" ) );
        debtSystem = ILnDebtSystem( _addressStorage.getAddressWithRequire( "LnDebtSystem", "LnDebtSystem address not valid" ) );
        address payable collateralAddress = payable(_addressStorage.getAddressWithRequire( "LnCollateralSystem","LnCollateralSystem address not valid" ));
        collaterSys = ILnCollateralSystem( collateralAddress );
        mConfig =        ILnConfig( _addressStorage.getAddressWithRequire( "LnConfig",     "LnConfig address not valid" ) );

        emit CachedAddressUpdated( "LnPrices",           address(priceGetter) );
        emit CachedAddressUpdated( "LnDebtSystem",       address(debtSystem) );
        emit CachedAddressUpdated( "LnCollateralSystem", address(collaterSys) );
        emit CachedAddressUpdated( "LnConfig",           address(mConfig) );
    }

    function SetLusdTokenAddress(address _address) public onlyAdmin {
        emit UpdateLusdToken(address(lUSDToken), _address);
        lUSDToken = ILnAsset(_address);
    }

    event UpdateLusdToken(address oldAddr, address newAddr);

    function MaxCanBuildAsset(address user) public view returns(uint256) {
        uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        uint256 maxCanBuild = collaterSys.MaxRedeemableInUsd(user).mul(buildRatio).div(SafeDecimalMath.unit());
        return maxCanBuild;
    }

    // build lusd
    function BuildAsset(uint256 amount) public whenNotPaused returns(bool) {
        address user = msg.sender;
        uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        uint256 maxCanBuild = collaterSys.MaxRedeemableInUsd(user).multiplyDecimal(buildRatio);
        require(amount <= maxCanBuild, "Build amount too big, you need more collateral");

        // calc debt
        (uint256 oldUserDebtBalance, uint256 totalAssetSupplyInUsd) = debtSystem.GetUserDebtBalanceInUsd(user);

        uint256 newTotalAssetSupply = totalAssetSupplyInUsd.add(amount);
        // update debt data
        uint256 buildDebtProportion = amount.divideDecimalRoundPrecise(newTotalAssetSupply);// debtPercentage
        uint oldTotalProportion = SafeDecimalMath.preciseUnit().sub(buildDebtProportion);// 

        uint256 newUserDebtProportion = buildDebtProportion;
        if (oldUserDebtBalance > 0) {
            newUserDebtProportion = oldUserDebtBalance.add(amount).divideDecimalRoundPrecise(newTotalAssetSupply);
        }

        // update debt
        debtSystem.UpdateDebt(user, newUserDebtProportion, oldTotalProportion);

        // mint asset
        lUSDToken.mint(user, amount);

        return true;
    }

    function BuildMaxAsset() external whenNotPaused {
        address user = msg.sender;
        uint256 max = MaxCanBuildAsset(user);
        BuildAsset(max);
    }

    function _burnAsset(address user, uint256 amount) internal {
        //uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        require(amount > 0, "amount need > 0");
        // calc debt
        (uint256 oldUserDebtBalance, uint256 totalAssetSupplyInUsd) = debtSystem.GetUserDebtBalanceInUsd(user);
        require(oldUserDebtBalance > 0, "no debt, no burn");
        uint256 burnAmount = oldUserDebtBalance < amount ? oldUserDebtBalance : amount;
        // burn asset
        lUSDToken.burn(user, burnAmount);

        uint newTotalDebtIssued = totalAssetSupplyInUsd.sub(burnAmount);

        uint oldTotalProportion = 0;
        if (newTotalDebtIssued > 0) {
            uint debtPercentage = burnAmount.divideDecimalRoundPrecise(newTotalDebtIssued);
            oldTotalProportion = SafeDecimalMath.preciseUnit().add(debtPercentage);
        }

        uint256 newUserDebtProportion = 0;
        if (oldUserDebtBalance > burnAmount) {
            uint newDebt = oldUserDebtBalance.sub(burnAmount);
            newUserDebtProportion = newDebt.divideDecimalRoundPrecise(newTotalDebtIssued);
        }

        // update debt
        debtSystem.UpdateDebt(user, newUserDebtProportion, oldTotalProportion);
    }

    // burn
    function BurnAsset(uint256 amount) external whenNotPaused returns(bool) {
        address user = msg.sender;
        _burnAsset(user, amount);
        return true;
    }

    //所有
    // function MaxAssetToTarget(address user) external view returns(uint256) {
    //     uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
    //     uint256 totalCollateral = collaterSys.GetUserTotalCollateralInUsd(user);
    // }

    // burn to target ratio
    function BurnAssetToTarget() external whenNotPaused returns(bool) {
        address user = msg.sender;

        uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        uint256 totalCollateral = collaterSys.GetUserTotalCollateralInUsd(user);
        uint256 maxBuildAssetToTarget = totalCollateral.multiplyDecimal(buildRatio);
        (uint256 debtAsset,) = debtSystem.GetUserDebtBalanceInUsd(user);
        require(debtAsset > maxBuildAssetToTarget, "You maybe want build to target");

        uint256 needBurn = debtAsset.sub(maxBuildAssetToTarget);
        uint balance = lUSDToken.balanceOf(user); // burn as many as possible
        if (balance < needBurn) {
            needBurn = balance;
        }
        _burnAsset(user, needBurn);
        return true;
    }
}
