// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "./interfaces/IERC20Metadata.sol";
import "./interfaces/ILnBuildBurnSystem.sol";
import "./interfaces/ILnConfig.sol";
import "./interfaces/ILnDebtSystem.sol";
import "./interfaces/ILnPrices.sol";
import "./interfaces/ILnRewardLocker.sol";
import "./upgradeable/LnAdminUpgradeable.sol";
import "./utilities/ConfigHelper.sol";
import "./utilities/TransferHelper.sol";
import "./SafeDecimalMath.sol";

// Note to code reader by Tommy as of 2023-07-10:
//
// This contract has been mostly rewritten after it's been deployed in production to properly
// support multi-collateral, with backward compatibility as a hard requirement.
//
// The original codebase assumed that all collateral types will be aggregated into a single USD
// amount, which is now (at the time of rewrite) considered impractical, as different collaterals
// have different risk characteristics. The new design is to have each `LnCollateralSystem` contract
// handle only a single collateral token.
//
// As such, the will be seemingly weird implementations across the contract that might make you
// wonder why it's even coded that way. Most likely it's for backward compatibility with the
// previous implementation. For more details check Git history.
contract LnCollateralSystem is LnAdminUpgradeable, PausableUpgradeable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    event UpdateTokenSetting(bytes32 symbol, address tokenAddr, uint256 minCollateral, bool close);
    event CollateralLog(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
    event RedeemCollateral(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
    event CollateralMoved(address fromUser, address toUser, bytes32 currency, uint256 amount);
    event CollateralUnlockReward(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);

    struct TokenInfo {
        address tokenAddr;
        uint256 minCollateral;
        uint256 totalCollateral;
        bool disabled;
    }

    struct CollateralData {
        uint256 collateral;
    }

    ILnPrices public priceGetter;
    ILnDebtSystem public debtSystem;
    ILnConfig public mConfig;
    ILnRewardLocker public mRewardLocker;

    // This storage slot was previously occupied but not used. The multi-collateral rewrite takes
    // advantage of it to use it for storing the collateral currency this contract instance deals
    // with. However, for the already deployed instance (for the native currency), this field will
    // remain zero. That's why there's a `collateralCurrency` function to determine the actual
    // currency used.
    //
    // This field is made private on purpose to prevent misuse. Callers should use the function
    // above instead.
    bytes32 private nonNativeCollateralCurrency;

    // We're only dealing with one token, but still using mapping to maintain backward-
    // compatibility.
    mapping(bytes32 => TokenInfo) public tokenInfos;

    // This is a storage slot that used to be called `tokenSymbol` for storing all configured
    // collateral tokens. The slot is kept to not break storage structure but it's no longer needed
    // for the contract.
    bytes32[] private DEPRECATED_DO_NOT_USE;

    // We're only dealing with one token, but still using nested mapping to maintain backward-
    // compatibility.
    //
    // [user] => ([collateralToken] => [CollateralData])
    mapping(address => mapping(bytes32 => CollateralData)) public userCollateralData;

    ILnBuildBurnSystem public buildBurnSystem;
    address public liquidation;

    uint8 private nonNativeCollateralDecimals;

    bytes32 public constant NATIVE_CURRENCY = "LINA";
    uint8 public constant NATIVE_CURRENCY_DECIMALS = 18;

    modifier onlyLiquidation() {
        require(msg.sender == liquidation, "LnCollateralSystem: not liquidation");
        _;
    }

    modifier onlyRewardLocker() {
        require(msg.sender == address(mRewardLocker), "LnCollateralSystem: not reward locker");
        _;
    }

    // See notes on `nonNativeCollateralCurrency`.
    function collateralCurrency() public view returns (bytes32) {
        return uint256(nonNativeCollateralCurrency) == 0 ? NATIVE_CURRENCY : nonNativeCollateralCurrency;
    }

    // See notes on `nonNativeCollateralDecimals`.
    function collateralDecimals() public view returns (uint8) {
        return uint256(nonNativeCollateralCurrency) == 0 ? NATIVE_CURRENCY_DECIMALS : nonNativeCollateralDecimals;
    }

    function getFreeCollateralInUsd(address user) external view returns (uint256) {
        uint256 totalCollateralInUsd = _getUserTotalCollateralInUsd(user);

        (uint256 debtBalance, ) = debtSystem.GetUserDebtBalanceInUsd(user);
        if (debtBalance == 0) {
            return totalCollateralInUsd;
        }

        uint256 buildRatio = mConfig.getUint(ConfigHelper.getBuildRatioKey(collateralCurrency()));
        uint256 minCollateral = debtBalance.divideDecimal(buildRatio);
        if (totalCollateralInUsd < minCollateral) {
            return 0;
        }

        return totalCollateralInUsd.sub(minCollateral);
    }

    // Despite the name, this function actually always returns the redeemable amount of the
    // collateral managed by this contract instance, instead of the native currency.
    function maxRedeemableLina(address user) external view returns (uint256) {
        return _maxRedeemableLina(user);
    }

    function GetSystemTotalCollateralInUsd() external view returns (uint256 rTotal) {
        bytes32 _collateralCurrency = collateralCurrency();
        uint256 collateralAmount = tokenInfos[_collateralCurrency].totalCollateral;
        if (_collateralCurrency == NATIVE_CURRENCY) {
            collateralAmount = collateralAmount.add(mRewardLocker.totalLockedAmount());
        }

        return collateralAmount.multiplyDecimalWith(priceGetter.getPrice(_collateralCurrency), collateralDecimals());
    }

    function GetUserTotalCollateralInUsd(address _user) external view returns (uint256 rTotal) {
        return _getUserTotalCollateralInUsd(_user);
    }

    function GetUserCollateral(address _user, bytes32 _currency) external view returns (uint256) {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(_currency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        // Staked balance
        uint256 collateralAmount = userCollateralData[_user][_currency].collateral;

        // Locked balance
        if (_currency == NATIVE_CURRENCY) {
            collateralAmount += mRewardLocker.balanceOf(_user);
        }

        return collateralAmount;
    }

    // Despite the name, this function actually always returns the breakdown of the collateral
    // managed by this contract instance, instead of the native currency.
    function getUserLinaCollateralBreakdown(address _user) external view returns (uint256 staked, uint256 locked) {
        bytes32 _collateralCurrency = collateralCurrency();

        uint256 stakedBalance = userCollateralData[_user][_collateralCurrency].collateral;

        uint256 lockedBalance = 0;
        if (_collateralCurrency == NATIVE_CURRENCY) {
            lockedBalance = mRewardLocker.balanceOf(_user);
        }

        return (stakedBalance, lockedBalance);
    }

    function IsSatisfyTargetRatio(address _user) external view returns (bool) {
        return isSatisfyTargetRatio(_user);
    }

    function __LnCollateralSystem_init(
        address _admin,
        ILnPrices _priceGetter,
        ILnDebtSystem _debtSystem,
        ILnConfig _mConfig,
        ILnRewardLocker _mRewardLocker,
        ILnBuildBurnSystem _buildBurnSystem,
        address _liquidation
    ) external initializer {
        __LnAdminUpgradeable_init(_admin);

        require(address(_priceGetter) != address(0), "LnCollateralSystem: zero address");
        require(address(_debtSystem) != address(0), "LnCollateralSystem: zero address");
        require(address(_mConfig) != address(0), "LnCollateralSystem: zero address");
        require(address(_mRewardLocker) != address(0), "LnCollateralSystem: zero address");
        require(address(_buildBurnSystem) != address(0), "LnCollateralSystem: zero address");
        require(address(_liquidation) != address(0), "LnCollateralSystem: zero address");

        priceGetter = _priceGetter;
        debtSystem = _debtSystem;
        mConfig = _mConfig;
        mRewardLocker = _mRewardLocker;
        buildBurnSystem = _buildBurnSystem;
        liquidation = _liquidation;
    }

    function setLiquidationAddress(address newAddress) external onlyAdmin {
        require(newAddress != address(0), "LnCollateralSystem: zero address");
        liquidation = newAddress;
    }

    function setRewardLockerAddress(ILnRewardLocker newAddress) external onlyAdmin {
        require(address(newAddress) != address(0), "LnCollateralSystem: zero address");
        mRewardLocker = newAddress;
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    // The original function allowed overwriting token info. We kept the interface in the rewrite
    // but changed to only allow calling it once.
    function updateTokenInfo(
        bytes32 _currency,
        address _tokenAddr,
        uint256 _minCollateral,
        bool _disabled
    ) external onlyAdmin {
        require(uint256(_currency) != 0, "LnCollateralSystem: empty symbol");
        require(_tokenAddr != address(0), "LnCollateralSystem: zero address");

        require(uint256(nonNativeCollateralCurrency) == 0, "LnCollateralSystem: token info already set");
        require(tokenInfos[_currency].tokenAddr == address(0), "LnCollateralSystem: token info already set");

        // Here we retain the same behavior in local environments as the previously deployed native
        // collateral instance.
        if (_currency != NATIVE_CURRENCY) {
            nonNativeCollateralCurrency = _currency;
            nonNativeCollateralDecimals = IERC20Metadata(_tokenAddr).decimals();
        }

        tokenInfos[_currency] = TokenInfo({
            tokenAddr: _tokenAddr,
            minCollateral: _minCollateral,
            totalCollateral: 0,
            disabled: _disabled
        });
        emit UpdateTokenSetting(_currency, _tokenAddr, _minCollateral, _disabled);
    }

    function Collateral(bytes32 _currency, uint256 _amount) external whenNotPaused returns (bool) {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(_currency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        return _collateral(msg.sender, _currency, _amount);
    }

    function Redeem(bytes32 _currency, uint256 _amount) external whenNotPaused returns (bool) {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(_currency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        _redeem(msg.sender, _currency, _amount);
        return true;
    }

    function RedeemMax(bytes32 _currency) external whenNotPaused {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(_currency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        _redeemMax(msg.sender, _currency);
    }

    /**
     * @dev A unified function for staking collateral and building lUSD atomically. Only up to one of
     * `stakeAmount` and `buildAmount` can be zero.
     *
     * @param stakeCurrency ID of the collateral currency
     * @param stakeAmount Amount of collateral currency to stake, can be zero
     * @param buildAmount Amount of lUSD to build, can be zero
     */
    function stakeAndBuild(
        bytes32 stakeCurrency,
        uint256 stakeAmount,
        uint256 buildAmount
    ) external whenNotPaused {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(stakeCurrency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        require(stakeAmount > 0 || buildAmount > 0, "LnCollateralSystem: zero amount");

        if (stakeAmount > 0) {
            _collateral(msg.sender, stakeCurrency, stakeAmount);
        }

        if (buildAmount > 0) {
            buildBurnSystem.buildFromCollateralSys(msg.sender, buildAmount);
        }
    }

    /**
     * @dev A unified function for staking collateral and building the maximum amount of lUSD atomically.
     *
     * @param stakeCurrency ID of the collateral currency
     * @param stakeAmount Amount of collateral currency to stake
     */
    function stakeAndBuildMax(bytes32 stakeCurrency, uint256 stakeAmount) external whenNotPaused {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(stakeCurrency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        require(stakeAmount > 0, "LnCollateralSystem: zero amount");

        _collateral(msg.sender, stakeCurrency, stakeAmount);
        buildBurnSystem.buildMaxFromCollateralSys(msg.sender);
    }

    /**
     * @dev A unified function for burning lUSD and unstaking collateral atomically. Only up to one of
     * `burnAmount` and `unstakeAmount` can be zero.
     *
     * @param burnAmount Amount of lUSD to burn, can be zero
     * @param unstakeCurrency ID of the collateral currency
     * @param unstakeAmount Amount of collateral currency to unstake, can be zero
     */
    function burnAndUnstake(
        uint256 burnAmount,
        bytes32 unstakeCurrency,
        uint256 unstakeAmount
    ) external whenNotPaused {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(unstakeCurrency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        require(burnAmount > 0 || unstakeAmount > 0, "LnCollateralSystem: zero amount");

        if (burnAmount > 0) {
            buildBurnSystem.burnFromCollateralSys(msg.sender, burnAmount);
        }

        if (unstakeAmount > 0) {
            _redeem(msg.sender, unstakeCurrency, unstakeAmount);
        }
    }

    /**
     * @dev A unified function for burning lUSD and unstaking the maximum amount of collateral atomically.
     *
     * @param burnAmount Amount of lUSD to burn
     * @param unstakeCurrency ID of the collateral currency
     */
    function burnAndUnstakeMax(uint256 burnAmount, bytes32 unstakeCurrency) external whenNotPaused {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(unstakeCurrency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        require(burnAmount > 0, "LnCollateralSystem: zero amount");

        buildBurnSystem.burnFromCollateralSys(msg.sender, burnAmount);
        _redeemMax(msg.sender, unstakeCurrency);
    }

    function moveCollateral(
        address fromUser,
        address toUser,
        bytes32 currency,
        uint256 amount
    ) external whenNotPaused onlyLiquidation {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(currency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        userCollateralData[fromUser][currency].collateral = userCollateralData[fromUser][currency].collateral.sub(amount);
        userCollateralData[toUser][currency].collateral = userCollateralData[toUser][currency].collateral.add(amount);
        emit CollateralMoved(fromUser, toUser, currency, amount);
    }

    function collateralFromUnlockReward(
        address user,
        address rewarder,
        bytes32 currency,
        uint256 amount
    ) external whenNotPaused onlyRewardLocker {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(currency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        require(user != address(0), "LnCollateralSystem: User address cannot be zero");
        require(amount > 0, "LnCollateralSystem: Collateral amount must be > 0");

        TokenInfo storage tokeninfo = tokenInfos[currency];
        require(tokeninfo.tokenAddr != address(0), "LnCollateralSystem: Invalid token symbol");

        TransferHelper.safeTransferFrom(tokeninfo.tokenAddr, rewarder, address(this), amount);

        userCollateralData[user][currency].collateral = userCollateralData[user][currency].collateral.add(amount);
        tokeninfo.totalCollateral = tokeninfo.totalCollateral.add(amount);

        emit CollateralUnlockReward(user, currency, amount, userCollateralData[user][currency].collateral);
    }

    function isSatisfyTargetRatio(address _user) private view returns (bool) {
        (uint256 debtBalance, ) = debtSystem.GetUserDebtBalanceInUsd(_user);
        if (debtBalance == 0) {
            return true;
        }

        uint256 buildRatio = mConfig.getUint(ConfigHelper.getBuildRatioKey(collateralCurrency()));
        uint256 totalCollateralInUsd = _getUserTotalCollateralInUsd(_user);
        if (totalCollateralInUsd == 0) {
            return false;
        }
        uint256 myratio = debtBalance.divideDecimal(totalCollateralInUsd);
        return myratio <= buildRatio;
    }

    function _getUserTotalCollateralInUsd(address _user) private view returns (uint256 rTotal) {
        bytes32 _collateralCurrency = collateralCurrency();
        uint256 collateralAmount = userCollateralData[_user][_collateralCurrency].collateral;
        if (_collateralCurrency == NATIVE_CURRENCY) {
            collateralAmount = collateralAmount.add(mRewardLocker.balanceOf(_user));
        }

        return collateralAmount.multiplyDecimalWith(priceGetter.getPrice(_collateralCurrency), collateralDecimals());
    }

    // Despite the name, this function actually always returns the redeemable amount of the
    // collateral managed by this contract instance, instead of the native currency.
    function _maxRedeemableLina(address user) private view returns (uint256) {
        bytes32 _collateralCurrency = collateralCurrency();

        (uint256 debtBalance, ) = debtSystem.GetUserDebtBalanceInUsd(user);
        uint256 stakedLinaAmount = userCollateralData[user][_collateralCurrency].collateral;

        if (debtBalance == 0) {
            // User doesn't have debt. All staked collateral is withdrawable
            return stakedLinaAmount;
        } else {
            // User has debt. Must keep a certain amount
            uint256 buildRatio = mConfig.getUint(ConfigHelper.getBuildRatioKey(_collateralCurrency));
            uint256 minCollateralUsd = debtBalance.divideDecimal(buildRatio);
            uint256 minCollateralLina =
                minCollateralUsd.divideDecimalWith(priceGetter.getPrice(_collateralCurrency), collateralDecimals());

            uint256 lockedLinaAmount = 0;
            if (_collateralCurrency == NATIVE_CURRENCY) {
                lockedLinaAmount = mRewardLocker.balanceOf(user);
            }

            return MathUpgradeable.min(stakedLinaAmount, stakedLinaAmount.add(lockedLinaAmount).sub(minCollateralLina));
        }
    }

    function _collateral(
        address user,
        bytes32 _currency,
        uint256 _amount
    ) private whenNotPaused returns (bool) {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(_currency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        TokenInfo storage tokeninfo = tokenInfos[_currency];
        require(_amount >= tokeninfo.minCollateral, "LnCollateralSystem: collateral amount too small");
        require(!tokeninfo.disabled, "LnCollateralSystem: collateral disabled");

        TransferHelper.safeTransferFrom(tokenInfos[_currency].tokenAddr, user, address(this), _amount);

        userCollateralData[user][_currency].collateral = userCollateralData[user][_currency].collateral.add(_amount);
        tokeninfo.totalCollateral = tokeninfo.totalCollateral.add(_amount);

        emit CollateralLog(user, _currency, _amount, userCollateralData[user][_currency].collateral);
        return true;
    }

    function _redeemMax(address user, bytes32 _currency) private {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(_currency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        _redeem(user, _currency, _maxRedeemableLina(user));
    }

    function _redeem(
        address user,
        bytes32 _currency,
        uint256 _amount
    ) private {
        // We shouldn't even take this param. But still taking it for backward-compatibility.
        require(_currency == collateralCurrency(), "LnCollateralSystem: currency symbol mismatch");

        require(_amount > 0, "LnCollateralSystem: zero amount");

        uint256 maxRedeemableLinaAmount = _maxRedeemableLina(user);
        require(_amount <= maxRedeemableLinaAmount, "LnCollateralSystem: insufficient collateral");

        userCollateralData[user][_currency].collateral = userCollateralData[user][_currency].collateral.sub(_amount);

        TokenInfo storage tokeninfo = tokenInfos[_currency];
        tokeninfo.totalCollateral = tokeninfo.totalCollateral.sub(_amount);

        TransferHelper.safeTransfer(tokeninfo.tokenAddr, user, _amount);

        emit RedeemCollateral(user, _currency, _amount, userCollateralData[user][_currency].collateral);
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[41] private __gap;
}
