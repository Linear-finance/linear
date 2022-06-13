// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./upgradeable/LnAdminUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/ILnPrices.sol";
import "./LnAddressCache.sol";
import "./interfaces/ILnAsset.sol";
import "./interfaces/ILnDebtSystem.sol";
import "./interfaces/ILnCollateralSystem.sol";
import "./interfaces/ILnConfig.sol";

// 根据 LnCollateralSystem 的抵押资产计算相关抵押率，buildable lusd
contract LnBuildBurnSystem is LnAdminUpgradeable, PausableUpgradeable, LnAddressCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    // -------------------------------------------------------
    // need set before system running value.
    ILnAsset private lUSDToken; // this contract need

    ILnDebtSystem private debtSystem;
    ILnPrices private priceGetter;
    ILnCollateralSystem private collaterSys;
    ILnConfig private mConfig;
    address private liquidation;

    bytes32 public constant Currency_LINA = "LINA";

    modifier onlyCollaterSys {
        require((msg.sender == address(collaterSys)), "LnBuildBurnSystem: not collateral system");
        _;
    }

    modifier onlyLiquidation {
        require((msg.sender == liquidation), "LnBuildBurnSystem: not liquidation");
        _;
    }

    // -------------------------------------------------------
    function __LnBuildBurnSystem_init(address admin, address _lUSDTokenAddr) public initializer {
        __LnAdminUpgradeable_init(admin);

        lUSDToken = ILnAsset(_lUSDTokenAddr);
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    function updateAddressCache(ILnAddressStorage _addressStorage) public override onlyAdmin {
        priceGetter = ILnPrices(_addressStorage.getAddressWithRequire("LnPrices", "LnPrices address not valid"));
        debtSystem = ILnDebtSystem(_addressStorage.getAddressWithRequire("LnDebtSystem", "LnDebtSystem address not valid"));
        address payable collateralAddress =
            payable(_addressStorage.getAddressWithRequire("LnCollateralSystem", "LnCollateralSystem address not valid"));
        collaterSys = ILnCollateralSystem(collateralAddress);
        mConfig = ILnConfig(_addressStorage.getAddressWithRequire("LnConfig", "LnConfig address not valid"));
        liquidation = _addressStorage.getAddressWithRequire("LnLiquidation", "LnLiquidation address not valid");

        emit CachedAddressUpdated("LnPrices", address(priceGetter));
        emit CachedAddressUpdated("LnDebtSystem", address(debtSystem));
        emit CachedAddressUpdated("LnCollateralSystem", address(collaterSys));
        emit CachedAddressUpdated("LnConfig", address(mConfig));
        emit CachedAddressUpdated("LnLiquidation", liquidation);
    }

    function SetLusdTokenAddress(address _address) public onlyAdmin {
        emit UpdateLusdToken(address(lUSDToken), _address);
        lUSDToken = ILnAsset(_address);
    }

    event UpdateLusdToken(address oldAddr, address newAddr);

    // /**
    //  * @notice This function is deprecated as it doesn't distinguish the underlying collateral. Use
    //  * `getMaxBuildableLusdAmount()` instead.
    //  */
    function MaxCanBuildAsset(address user) public view returns (uint256) {
        return getMaxBuildableLusdAmount(user, Currency_LINA);
    }

    function getMaxBuildableLusdAmount(address user, bytes32 currencySymbol) public view returns (uint256) {
        bytes32 buildRatioConfigKey = mConfig.getBuildRatioKey(currencySymbol);
        uint256 buildRatio = mConfig.getUint(buildRatioConfigKey);
        uint256 maxBuildableAmount =
            collaterSys.getFreeCollateralInUsd(user, currencySymbol).mul(buildRatio).div(SafeDecimalMath.unit());
        return maxBuildableAmount;
    }

    // build lusd with currency specified
    function BuildAsset(uint256 amount, bytes32 currencySymbol) external whenNotPaused returns (bool) {
        address user = msg.sender;
        return _buildAsset(user, amount, currencySymbol);
    }

    function _buildAsset(
        address user,
        uint256 amount,
        bytes32 currencySymbol
    ) internal returns (bool) {
        bytes32 buildRatioConfigKey = mConfig.getBuildRatioKey(currencySymbol);
        uint256 buildRatio = mConfig.getUint(buildRatioConfigKey);
        uint256 maxCanBuild = collaterSys.getFreeCollateralInUsd(user, currencySymbol).multiplyDecimal(buildRatio);
        require(amount <= maxCanBuild, "Build amount too big, you need more collateral");

        // calc debt
        (uint256 oldUserDebtBalance, uint256 totalAssetSupplyInUsd) =
            debtSystem.GetUserDebtBalanceInUsd(user, currencySymbol);

        uint256 newTotalAssetSupply = totalAssetSupplyInUsd.add(amount);
        // update debt data
        uint256 buildDebtProportion = amount.divideDecimalRoundPrecise(newTotalAssetSupply); // debtPercentage
        uint oldTotalProportion = SafeDecimalMath.preciseUnit().sub(buildDebtProportion); //

        uint256 newUserDebtProportion = buildDebtProportion;
        if (oldUserDebtBalance > 0) {
            newUserDebtProportion = oldUserDebtBalance.add(amount).divideDecimalRoundPrecise(newTotalAssetSupply);
        }

        // update debt
        debtSystem.UpdateDebt(user, newUserDebtProportion, oldTotalProportion, currencySymbol);

        // mint asset
        lUSDToken.mint(user, amount);

        return true;
    }

    function BuildMaxAsset(bytes32 currencySymbol) external whenNotPaused {
        _buildMaxAsset(msg.sender, currencySymbol);
    }

    function _buildMaxAsset(address user, bytes32 currencySymbol) private {
        uint256 max = getMaxBuildableLusdAmount(user, currencySymbol);
        _buildAsset(user, max, currencySymbol);
    }

    function _burnAsset(
        address debtUser,
        address burnUser,
        uint256 amount,
        bytes32 currencySymbol
    ) internal {
        //uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        require(amount > 0, "amount need > 0");
        // calc debt
        (uint256 oldUserDebtBalance, uint256 totalAssetSupplyInUsd) =
            debtSystem.GetUserDebtBalanceInUsd(debtUser, currencySymbol);
        require(oldUserDebtBalance > 0, "no debt, no burn");
        uint256 burnAmount = oldUserDebtBalance < amount ? oldUserDebtBalance : amount;
        // burn asset
        lUSDToken.burn(burnUser, burnAmount);

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
        debtSystem.UpdateDebt(debtUser, newUserDebtProportion, oldTotalProportion, currencySymbol);
    }

    // burn
    function BurnAsset(uint256 amount, bytes32 currencySymbol) external whenNotPaused returns (bool) {
        address user = msg.sender;
        _burnAsset(user, user, amount, currencySymbol);
        return true;
    }

    //所有
    // function MaxAssetToTarget(address user) external view returns(uint256) {
    //     uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
    //     uint256 totalCollateral = collaterSys.GetUserTotalCollateralInUsd(user);
    // }

    // burn to target ratio
    function BurnAssetToTarget(bytes32 currencySymbol) external whenNotPaused returns (bool) {
        address user = msg.sender;

        bytes32 buildRatioKey = mConfig.getBuildRatioKey(currencySymbol);
        uint256 buildRatio = mConfig.getUint(buildRatioKey);
        uint256 totalCollateral = collaterSys.GetUserCollateral(user, currencySymbol);
        uint256 maxBuildAssetToTarget = totalCollateral.multiplyDecimal(buildRatio);
        (uint256 debtAsset, ) = debtSystem.GetUserDebtBalanceInUsd(user, currencySymbol);
        require(debtAsset > maxBuildAssetToTarget, "You maybe want build to target");

        uint256 needBurn = debtAsset.sub(maxBuildAssetToTarget);
        uint balance = lUSDToken.balanceOf(user); // burn as many as possible
        if (balance < needBurn) {
            needBurn = balance;
        }
        _burnAsset(user, user, needBurn, currencySymbol);
        return true;
    }

    function buildFromCollateralSys(
        address user,
        uint256 amount,
        bytes32 currencySymbol
    ) external whenNotPaused onlyCollaterSys {
        _buildAsset(user, amount, currencySymbol);
    }

    function buildMaxFromCollateralSys(address user, bytes32 currencySymbol) external whenNotPaused onlyCollaterSys {
        _buildMaxAsset(user, currencySymbol);
    }

    function burnFromCollateralSys(
        address user,
        uint256 amount,
        bytes32 currencySymbol
    ) external whenNotPaused onlyCollaterSys {
        _burnAsset(user, user, amount, currencySymbol);
    }

    function burnForLiquidation(
        address user,
        address liquidator,
        uint256 amount,
        bytes32 currencySymbol
    ) external whenNotPaused onlyLiquidation {
        _burnAsset(user, liquidator, amount, currencySymbol);
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[44] private __gap;
}
