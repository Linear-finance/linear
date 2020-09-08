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
import "./LnAsset.sol";
import "./LnAssetSystem.sol";
import "./LnDebtSystem.sol";
import "./LnCollateralSystem.sol";
import "./LnConfig.sol";

// 根据 LnCollateralSystem 的抵押资产计算相关抵押率，buildable lusd
contract LnBuildBurnSystem is LnAdmin, Pausable, LnAddressCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Address for address;

    // -------------------------------------------------------
    // need set before system running value.
    LnAsset private lUSDToken; // this contract need 

    LnDebtSystem private debtSystem;
    LnAssetSystem private assetSys;
    LnPrices private priceGetter;
    LnCollateralSystem private collaterSys;
    LnConfig private mConfig;
    // -------------------------------------------------------
    constructor(address admin, address _lUSDTokenAddr) public LnAdmin(admin) {
        lUSDToken = LnAsset(_lUSDTokenAddr);
    }

    function updateAddressCache( LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        priceGetter =    LnPrices( _addressStorage.getAddressWithRequire( "LnPrices",     "LnPrices address not valid" ) );
        debtSystem = LnDebtSystem( _addressStorage.getAddressWithRequire( "LnDebtSystem", "LnDebtSystem address not valid" ) );
        assetSys =  LnAssetSystem( _addressStorage.getAddressWithRequire( "LnAssetSystem","LnAssetSystem address not valid" ) );
        collaterSys = LnCollateralSystem( _addressStorage.getAddressWithRequire( "LnCollateralSystem","LnCollateralSystem address not valid" ) );
        mConfig =        LnConfig( _addressStorage.getAddressWithRequire( "LnConfig",     "LnConfig address not valid" ) );

        emit updateCachedAddress( "LnPrices",           address(priceGetter) );
        emit updateCachedAddress( "LnDebtSystem",       address(debtSystem) );
        emit updateCachedAddress( "LnAssetSystem",      address(assetSys) );
        emit updateCachedAddress( "LnCollateralSystem", address(collaterSys) );
        emit updateCachedAddress( "LnConfig",           address(mConfig) );
    }

    function SetLusdTokenAddress(address _address) public onlyAdmin {
        emit UpdateLusdToken(address(lUSDToken), _address);
        lUSDToken = LnAsset(_address);
    }

    event UpdateLusdToken(address oldAddr, address newAddr);

    function MaxCanBuildAsset(address user) external view returns(uint256) {
        uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        uint256 maxCanBuild = collaterSys.MaxRedeemableInUsd(user).mul(buildRatio).div(SafeDecimalMath.unit());
        return maxCanBuild;
    }

    // build lusd
    function BuildAsset(uint256 amount) external returns(bool) {
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

    // burn
    function BurnAsset(uint256 amount) external returns(bool) {
        address user = msg.sender;
        //uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());

        // calc debt
        (uint256 oldUserDebtBalance, uint256 totalAssetSupplyInUsd) = debtSystem.GetUserDebtBalanceInUsd(user);

        uint256 burnAmount = oldUserDebtBalance < amount ? oldUserDebtBalance : amount;

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

        // burn asset
        lUSDToken.mint(user, burnAmount);

        return true;
    }

}
