// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./SafeDecimalMath.sol";
import "./LnPrices.sol";
import "./LnAddressCache.sol";
import "./LnAssetUpgradeable.sol";
import "./LnAssetSystem.sol";
import "./LnDebtSystem.sol";
import "./LnCollateralSystem.sol";
import "./LnConfig.sol";

// 根据 LnCollateralSystem 的抵押资产计算相关抵押率，buildable lusd
contract LnBuildBurnSystem is LnAdmin, Pausable, LnAddressCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Address for address;

    bytes32 constant public Currency_LINA = "LINA";
    // -------------------------------------------------------
    // need set before system running value.
    LnAssetUpgradeable private lUSDToken; // this contract need 

    LnDebtSystem private debtSystem;
    LnAssetSystem private assetSys;
    LnPrices private priceGetter;
    LnCollateralSystem private collaterSys;
    LnConfig private mConfig;
    LnRewardLocker public mRewardLocker;
    // -------------------------------------------------------
    constructor(address admin, address _lUSDTokenAddr) public LnAdmin(admin) {
        lUSDToken = LnAssetUpgradeable(_lUSDTokenAddr);
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    function updateAddressCache( LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        priceGetter =    LnPrices( _addressStorage.getAddressWithRequire( "LnPrices",     "LnPrices address not valid" ) );
        debtSystem = LnDebtSystem( _addressStorage.getAddressWithRequire( "LnDebtSystem", "LnDebtSystem address not valid" ) );
        assetSys =  LnAssetSystem( _addressStorage.getAddressWithRequire( "LnAssetSystem","LnAssetSystem address not valid" ) );
        address payable collateralAddress = payable(_addressStorage.getAddressWithRequire( "LnCollateralSystem","LnCollateralSystem address not valid" ));
        collaterSys = LnCollateralSystem( collateralAddress );
        mConfig =        LnConfig( _addressStorage.getAddressWithRequire( "LnConfig",     "LnConfig address not valid" ) );
        mRewardLocker =   LnRewardLocker(   _addressStorage.getAddressWithRequire( "LnRewardLocker",    "LnRewardLocker address not valid" ));

        emit CachedAddressUpdated( "LnPrices",           address(priceGetter) );
        emit CachedAddressUpdated( "LnDebtSystem",       address(debtSystem) );
        emit CachedAddressUpdated( "LnAssetSystem",      address(assetSys) );
        emit CachedAddressUpdated( "LnCollateralSystem", address(collaterSys) );
        emit CachedAddressUpdated( "LnConfig",           address(mConfig) );
    }

    function SetLusdTokenAddress(address _address) public onlyAdmin {
        emit UpdateLusdToken(address(lUSDToken), _address);
        lUSDToken = LnAssetUpgradeable(_address);
    }

    event UpdateLusdToken(address oldAddr, address newAddr);

    function MaxCanBuildAsset(address user) public view returns(uint256) {
        uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        uint256 maxCanBuild = collaterSys.MaxRedeemableInUsd(user).mul(buildRatio).div(SafeDecimalMath.unit());
        return maxCanBuild;
    }

    //input LINA amount LINA->lUSD
    function calcBuildAmount(address _user, uint256 _amount) public view returns(uint256) {
        uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        uint256 canBuildUsd = _amount.mul(priceGetter.getPrice(Currency_LINA)).multiplyDecimal(buildRatio).div(SafeDecimalMath.unit());

        (uint256 debtBalance, ) = debtSystem.GetUserDebtBalanceInUsd(_user);
        if (debtBalance == 0) {
            return canBuildUsd;
        }

        uint256 minCollateral = debtBalance.divideDecimal(buildRatio);
        if (canBuildUsd < minCollateral) {
            return 0;
        }

        return canBuildUsd.sub(minCollateral);
    }

    //input asset amount lUSD->LINA
    function calcRedeemAmount(address user, uint256 _amount) public view returns(uint256) {
        uint256 canRedeem = _amount.divideDecimal(priceGetter.getPrice(Currency_LINA));
        uint256 linaCollateral = collaterSys.GetUserCollateral(user, Currency_LINA);
        uint256 lockedLina = mRewardLocker.balanceOf(user);
        if (canRedeem > linaCollateral.add(lockedLina)) {
            canRedeem = linaCollateral.add(lockedLina);
        }
        if (canRedeem <= lockedLina) {
            return 0;
        }
        return canRedeem.sub(lockedLina);
    }


    // build lusd
    function BuildAsset(address user, uint256 amount) public whenNotPaused returns(bool) {
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

    function BuildMaxAsset(address user) external whenNotPaused {
        uint256 max = MaxCanBuildAsset(user);
        BuildAsset(user, max);
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
    function BurnAsset(address user, uint256 amount) external whenNotPaused returns(bool) {
        _burnAsset(user, amount);
        return true;
    }

    //所有
    // function MaxAssetToTarget(address user) external view returns(uint256) {
    //     uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
    //     uint256 totalCollateral = collaterSys.GetUserTotalCollateralInUsd(user);
    // }

    // burn to target ratio
    function BurnAssetToTarget(address user) external whenNotPaused returns(bool) {

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
