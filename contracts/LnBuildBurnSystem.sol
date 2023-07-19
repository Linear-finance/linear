// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./upgradeable/LnAdminUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./SafeDecimalMath.sol";
import "./interfaces/ILnPrices.sol";
import "./interfaces/ILnAsset.sol";
import "./interfaces/ILnDebtSystem.sol";
import "./interfaces/ILnCollateralSystem.sol";
import "./interfaces/ILnConfig.sol";
import "./utilities/ConfigHelper.sol";

// 根据 LnCollateralSystem 的抵押资产计算相关抵押率，buildable lusd
contract LnBuildBurnSystem is LnAdminUpgradeable, PausableUpgradeable {
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

    modifier onlyCollaterSys {
        require((msg.sender == address(collaterSys)), "LnBuildBurnSystem: not collateral system");
        _;
    }

    modifier onlyLiquidation {
        require((msg.sender == liquidation), "LnBuildBurnSystem: not liquidation");
        _;
    }

    // -------------------------------------------------------
    function __LnBuildBurnSystem_init(
        address admin,
        ILnAsset _lUSDToken,
        ILnDebtSystem _debtSystem,
        ILnPrices _priceGetter,
        ILnCollateralSystem _collaterSys,
        ILnConfig _mConfig,
        address _liquidation
    ) public initializer {
        __LnAdminUpgradeable_init(admin);

        require(address(_lUSDToken) != address(0), "LnBuildBurnSystem: zero address");
        require(address(_debtSystem) != address(0), "LnBuildBurnSystem: zero address");
        require(address(_priceGetter) != address(0), "LnBuildBurnSystem: zero address");
        require(address(_collaterSys) != address(0), "LnBuildBurnSystem: zero address");
        require(address(_mConfig) != address(0), "LnBuildBurnSystem: zero address");
        require(address(_liquidation) != address(0), "LnBuildBurnSystem: zero address");

        lUSDToken = ILnAsset(_lUSDToken);
        debtSystem = _debtSystem;
        priceGetter = _priceGetter;
        collaterSys = _collaterSys;
        mConfig = _mConfig;
        liquidation = _liquidation;
    }

    function setCollateralSystemAddress(ILnCollateralSystem newAddress) external onlyAdmin {
        require(address(newAddress) != address(0), "LnBuildBurnSystem: zero address");
        collaterSys = newAddress;
    }

    function setLiquidationAddress(address newAddress) external onlyAdmin {
        require(newAddress != address(0), "LnBuildBurnSystem: zero address");
        liquidation = newAddress;
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    function SetLusdTokenAddress(address _address) public onlyAdmin {
        emit UpdateLusdToken(address(lUSDToken), _address);
        lUSDToken = ILnAsset(_address);
    }

    event UpdateLusdToken(address oldAddr, address newAddr);
    event Mint(address user, uint256 amount);
    event Burn(address debtUser, address burnUser, uint256 burnAmount);

    function MaxCanBuildAsset(address user) public view returns (uint256) {
        uint256 buildRatio = mConfig.getUint(ConfigHelper.getBuildRatioKey(collaterSys.collateralCurrency()));
        uint256 maxCanBuild = collaterSys.getFreeCollateralInUsd(user).mul(buildRatio).div(SafeDecimalMath.unit());
        return maxCanBuild;
    }

    // build lusd
    function BuildAsset(uint256 amount) external whenNotPaused returns (bool) {
        address user = msg.sender;
        return _buildAsset(user, amount);
    }

    function _buildAsset(address user, uint256 amount) internal returns (bool) {
        uint256 buildRatio = mConfig.getUint(ConfigHelper.getBuildRatioKey(collaterSys.collateralCurrency()));
        uint256 maxCanBuild = collaterSys.getFreeCollateralInUsd(user).multiplyDecimal(buildRatio);
        require(amount <= maxCanBuild, "Build amount too big, you need more collateral");

        debtSystem.increaseDebt(user, amount);

        // mint asset
        lUSDToken.mint(user, amount);

        emit Mint(user, amount);

        return true;
    }

    function BuildMaxAsset() external whenNotPaused {
        _buildMaxAsset(msg.sender);
    }

    function _buildMaxAsset(address user) private {
        uint256 max = MaxCanBuildAsset(user);
        _buildAsset(user, max);
    }

    function _burnAsset(
        address debtUser,
        address burnUser,
        uint256 amount
    ) internal {
        require(amount > 0, "amount need > 0");

        (uint256 oldUserDebtBalance, ) = debtSystem.GetUserDebtBalanceInUsd(debtUser);
        require(oldUserDebtBalance > 0, "no debt, no burn");
        uint256 burnAmount = oldUserDebtBalance < amount ? oldUserDebtBalance : amount;

        debtSystem.decreaseDebt(debtUser, burnAmount);

        // burn asset
        lUSDToken.burn(burnUser, burnAmount);

        emit Burn(debtUser, burnUser, burnAmount);
    }

    // burn
    function BurnAsset(uint256 amount) external whenNotPaused returns (bool) {
        address user = msg.sender;
        _burnAsset(user, user, amount);
        return true;
    }

    //所有
    // function MaxAssetToTarget(address user) external view returns(uint256) {
    //     uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
    //     uint256 totalCollateral = collaterSys.GetUserTotalCollateralInUsd(user);
    // }

    // burn to target ratio
    function BurnAssetToTarget() external whenNotPaused returns (bool) {
        address user = msg.sender;

        uint256 buildRatio = mConfig.getUint(ConfigHelper.getBuildRatioKey(collaterSys.collateralCurrency()));
        uint256 totalCollateral = collaterSys.GetUserTotalCollateralInUsd(user);
        uint256 maxBuildAssetToTarget = totalCollateral.multiplyDecimal(buildRatio);
        (uint256 debtAsset, ) = debtSystem.GetUserDebtBalanceInUsd(user);
        require(debtAsset > maxBuildAssetToTarget, "You maybe want build to target");

        uint256 needBurn = debtAsset.sub(maxBuildAssetToTarget);
        uint balance = lUSDToken.balanceOf(user); // burn as many as possible
        if (balance < needBurn) {
            needBurn = balance;
        }
        _burnAsset(user, user, needBurn);
        return true;
    }

    function buildFromCollateralSys(address user, uint256 amount) external whenNotPaused onlyCollaterSys {
        _buildAsset(user, amount);
    }

    function buildMaxFromCollateralSys(address user) external whenNotPaused onlyCollaterSys {
        _buildMaxAsset(user);
    }

    function burnFromCollateralSys(address user, uint256 amount) external whenNotPaused onlyCollaterSys {
        _burnAsset(user, user, amount);
    }

    function burnForLiquidation(
        address user,
        address liquidator,
        uint256 amount
    ) external whenNotPaused onlyLiquidation {
        _burnAsset(user, liquidator, amount);
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[44] private __gap;
}
