// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "./interfaces/ILnBuildBurnSystem.sol";
import "./interfaces/ILnConfig.sol";
import "./interfaces/ILnDebtSystem.sol";
import "./interfaces/ILnPrices.sol";
import "./interfaces/ILnRewardLocker.sol";
import "./upgradeable/LnAdminUpgradeable.sol";
import "./utilities/TransferHelper.sol";
import "./LnAddressCache.sol";
import "./SafeDecimalMath.sol";

// 单纯抵押进来
// 赎回时需要 债务率良好才能赎回， 赎回部分能保持债务率高于目标债务率
contract LnCollateralSystem is LnAdminUpgradeable, PausableUpgradeable, LnAddressCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using AddressUpgradeable for address;

    // -------------------------------------------------------
    // need set before system running value.
    ILnPrices public priceGetter;
    ILnDebtSystem public debtSystem;
    ILnConfig public mConfig;
    ILnRewardLocker public mRewardLocker;

    bytes32 public constant Currency_ETH = "ETH";
    bytes32 public constant Currency_LINA = "LINA";

    // -------------------------------------------------------
    uint256 public uniqueId; // use log

    struct TokenInfo {
        address tokenAddr;
        uint256 minCollateral; // min collateral amount.
        uint256 totalCollateral;
        bool bClose; // TODO : 为了防止价格波动，另外再加个折扣价?
    }

    mapping(bytes32 => TokenInfo) public tokenInfos;
    bytes32[] public tokenSymbol; // keys of tokenInfos, use to iteration

    struct CollateralData {
        uint256 collateral; // total collateral
    }

    // [user] => ([token=> collateraldata])
    mapping(address => mapping(bytes32 => CollateralData)) public userCollateralData;

    // State variables added by upgrades
    ILnBuildBurnSystem public buildBurnSystem;
    address public liquidation;

    bytes32 private constant BUILD_RATIO_KEY = "BuildRatio";

    modifier onlyLiquidation() {
        require(msg.sender == liquidation, "LnCollateralSystem: not liquidation");
        _;
    }

    modifier onlyRewardLocker() {
        require(msg.sender == address(mRewardLocker), "LnCollateralSystem: not reward locker");
        _;
    }

    /**
     * @notice This function is deprecated as it doesn't do what its name suggests. Use
     * `getFreeCollateralInUsd()` instead. This function is not removed since it's still
     * used by `LnBuildBurnSystem`.
     */
    function MaxRedeemableInUsd(address _user) public view returns (uint256) {
        return getFreeCollateralInUsd(_user, "LINA");
    }

    function getFreeCollateralInUsd(address user, bytes32 currencySymbol) public view returns (uint256) {
        uint256 totalCollateralInUsd = GetUserCollateralInUsd(user, currencySymbol);

        (uint256 debtBalance, ) = debtSystem.GetUserDebtBalanceInUsdByCurrency(user, currencySymbol);
        if (debtBalance == 0) {
            return totalCollateralInUsd;
        }

        uint256 buildRatio = mConfig.getUint(mConfig.getBuildRatioKey(currencySymbol));
        uint256 minCollateral = debtBalance.divideDecimal(buildRatio);
        if (totalCollateralInUsd < minCollateral) {
            return 0;
        }

        return totalCollateralInUsd.sub(minCollateral);
    }

    /**
     * @notice This function is removed due to contract size limit.
     */
    // function maxRedeemableLina(address user) public view returns (uint256) {
    //     return maxRedeemable(user, "LINA");
    // }

    function maxRedeemable(address user, bytes32 currencySymbol) public view returns (uint256) {
        (uint256 debtBalance, ) = debtSystem.GetUserDebtBalanceInUsdByCurrency(user, currencySymbol);
        uint256 stakedAmount = userCollateralData[user][currencySymbol].collateral;

        if (debtBalance == 0) {
            // User doesn't have debt. All staked collateral is withdrawable
            return stakedAmount;
        } else {
            // User has debt. Must keep a certain amount
            uint256 buildRatio = mConfig.getUint(mConfig.getBuildRatioKey(currencySymbol));
            uint256 minCollateralUsd = debtBalance.divideDecimal(buildRatio);
            uint256 minCollateralToken = minCollateralUsd.divideDecimal(priceGetter.getPrice(currencySymbol));
            if (currencySymbol == Currency_LINA) {
                uint256 lockedLinaAmount = mRewardLocker.balanceOf(user);
                return MathUpgradeable.min(stakedAmount, stakedAmount.add(lockedLinaAmount).sub(minCollateralToken));
            } else {
                return stakedAmount.sub(minCollateralToken);
            }
        }
    }

    // -------------------------------------------------------
    function __LnCollateralSystem_init(address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    // ------------------ system config ----------------------
    function updateAddressCache(ILnAddressStorage _addressStorage) public override onlyAdmin {
        priceGetter = ILnPrices(_addressStorage.getAddressWithRequire("LnPrices", "LnPrices address not valid"));
        debtSystem = ILnDebtSystem(_addressStorage.getAddressWithRequire("LnDebtSystem", "LnDebtSystem address not valid"));
        mConfig = ILnConfig(_addressStorage.getAddressWithRequire("LnConfig", "LnConfig address not valid"));
        mRewardLocker = ILnRewardLocker(
            _addressStorage.getAddressWithRequire("LnRewardLocker", "LnRewardLocker address not valid")
        );
        buildBurnSystem = ILnBuildBurnSystem(
            _addressStorage.getAddressWithRequire("LnBuildBurnSystem", "LnBuildBurnSystem address not valid")
        );
        liquidation = _addressStorage.getAddressWithRequire("LnLiquidation", "LnLiquidation address not valid");

        emit CachedAddressUpdated("LnPrices", address(priceGetter));
        emit CachedAddressUpdated("LnDebtSystem", address(debtSystem));
        emit CachedAddressUpdated("LnConfig", address(mConfig));
        emit CachedAddressUpdated("LnRewardLocker", address(mRewardLocker));
        emit CachedAddressUpdated("LnBuildBurnSystem", address(buildBurnSystem));
        emit CachedAddressUpdated("LnLiquidation", liquidation);
    }

    function updateTokenInfo(
        bytes32 _currency,
        address _tokenAddr,
        uint256 _minCollateral,
        bool _close
    ) private returns (bool) {
        require(_currency[0] != 0, "symbol cannot empty");
        require(_currency != Currency_ETH, "ETH is used by system");
        require(_tokenAddr != address(0), "token address cannot zero");
        require(_tokenAddr.isContract(), "token address is not a contract");

        if (tokenInfos[_currency].tokenAddr == address(0)) {
            // new token
            tokenSymbol.push(_currency);
        }

        tokenInfos[_currency] = TokenInfo({
            tokenAddr: _tokenAddr,
            minCollateral: _minCollateral,
            totalCollateral: tokenInfos[_currency].totalCollateral,
            bClose: _close
        });
        emit UpdateTokenSetting(_currency, _tokenAddr, _minCollateral, _close);
        return true;
    }

    // delete token info? need to handle it's staking data.

    function UpdateTokenInfo(
        bytes32 _currency,
        address _tokenAddr,
        uint256 _minCollateral,
        bool _close
    ) external onlyAdmin returns (bool) {
        return updateTokenInfo(_currency, _tokenAddr, _minCollateral, _close);
    }

    function UpdateTokenInfos(
        bytes32[] calldata _symbols,
        address[] calldata _tokenAddrs,
        uint256[] calldata _minCollateral,
        bool[] calldata _closes
    ) external onlyAdmin returns (bool) {
        require(_symbols.length == _tokenAddrs.length, "length of array not eq");
        require(_symbols.length == _minCollateral.length, "length of array not eq");
        require(_symbols.length == _closes.length, "length of array not eq");

        for (uint256 i = 0; i < _symbols.length; i++) {
            updateTokenInfo(_symbols[i], _tokenAddrs[i], _minCollateral[i], _closes[i]);
        }

        return true;
    }

    // ------------------------------------------------------------------------
    function GetSystemTotalCollateralInUsd() public view returns (uint256 rTotal) {
        for (uint256 i = 0; i < tokenSymbol.length; i++) {
            bytes32 currency = tokenSymbol[i];
            uint256 collateralAmount = tokenInfos[currency].totalCollateral;
            if (Currency_LINA == currency) {
                collateralAmount = collateralAmount.add(mRewardLocker.totalLockedAmount());
            }
            if (collateralAmount > 0) {
                rTotal = rTotal.add(collateralAmount.multiplyDecimal(priceGetter.getPrice(currency)));
            }
        }

        if (address(this).balance > 0) {
            rTotal = rTotal.add(address(this).balance.multiplyDecimal(priceGetter.getPrice(Currency_ETH)));
        }
    }

    function GetUserCollateralInUsd(address _user, bytes32 _currencySymbol) internal view returns (uint256 rTotal) {
        uint256 collateralAmount = userCollateralData[_user][_currencySymbol].collateral;
        if (Currency_LINA == _currencySymbol) {
            collateralAmount = collateralAmount.add(mRewardLocker.balanceOf(_user));
        }
        if (collateralAmount > 0) {
            rTotal = rTotal.add(collateralAmount.multiplyDecimal(priceGetter.getPrice(_currencySymbol)));
        }
    }

    function GetUserTotalCollateralInUsd(address _user) public view returns (uint256 rTotal) {
        for (uint256 i = 0; i < tokenSymbol.length; i++) {
            rTotal = rTotal.add(GetUserCollateralInUsd(_user, tokenSymbol[i]));
        }

        if (userCollateralData[_user][Currency_ETH].collateral > 0) {
            rTotal = rTotal.add(
                userCollateralData[_user][Currency_ETH].collateral.multiplyDecimal(priceGetter.getPrice(Currency_ETH))
            );
        }
    }

    function GetUserCollateral(address _user, bytes32 _currency) external view returns (uint256) {
        if (Currency_LINA != _currency) {
            return userCollateralData[_user][_currency].collateral;
        }
        return mRewardLocker.balanceOf(_user).add(userCollateralData[_user][_currency].collateral);
    }

    function getUserLinaCollateralBreakdown(address _user) external view returns (uint256 staked, uint256 locked) {
        return (userCollateralData[_user]["LINA"].collateral, mRewardLocker.balanceOf(_user));
    }

    // NOTE: LINA collateral not include reward in locker
    function GetUserCollaterals(address _user) external view returns (bytes32[] memory, uint256[] memory) {
        bytes32[] memory rCurrency = new bytes32[](tokenSymbol.length + 1);
        uint256[] memory rAmount = new uint256[](tokenSymbol.length + 1);
        uint256 retSize = 0;
        for (uint256 i = 0; i < tokenSymbol.length; i++) {
            bytes32 currency = tokenSymbol[i];
            if (userCollateralData[_user][currency].collateral > 0) {
                rCurrency[retSize] = currency;
                rAmount[retSize] = userCollateralData[_user][currency].collateral;
                retSize++;
            }
        }
        if (userCollateralData[_user][Currency_ETH].collateral > 0) {
            rCurrency[retSize] = Currency_ETH;
            rAmount[retSize] = userCollateralData[_user][Currency_ETH].collateral;
            retSize++;
        }

        return (rCurrency, rAmount);
    }

    /**
     * @dev A temporary method for migrating LINA tokens from LnSimpleStaking to LnCollateralSystem
     * without user intervention.
     */
    function migrateCollateral(
        bytes32 _currency,
        address[] calldata _users,
        uint256[] calldata _amounts
    ) external onlyAdmin returns (bool) {
        require(tokenInfos[_currency].tokenAddr.isContract(), "Invalid token symbol");
        TokenInfo storage tokeninfo = tokenInfos[_currency];
        require(tokeninfo.bClose == false, "This token is closed");
        require(_users.length == _amounts.length, "Length mismatch");

        for (uint256 ind = 0; ind < _amounts.length; ind++) {
            address user = _users[ind];
            uint256 amount = _amounts[ind];

            userCollateralData[user][_currency].collateral = userCollateralData[user][_currency].collateral.add(amount);
            tokeninfo.totalCollateral = tokeninfo.totalCollateral.add(amount);

            emit CollateralLog(user, _currency, amount, userCollateralData[user][_currency].collateral);
        }
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
        require(stakeAmount > 0 || buildAmount > 0, "LnCollateralSystem: zero amount");

        if (stakeAmount > 0) {
            _collateral(msg.sender, stakeCurrency, stakeAmount);
        }

        if (buildAmount > 0) {
            buildBurnSystem.buildFromCollateralSys(msg.sender, buildAmount, stakeCurrency);
        }
    }

    /**
     * @dev A unified function for staking collateral and building the maximum amount of lUSD atomically.
     *
     * @param stakeCurrency ID of the collateral currency
     * @param stakeAmount Amount of collateral currency to stake
     */
    function stakeAndBuildMax(bytes32 stakeCurrency, uint256 stakeAmount) external whenNotPaused {
        require(stakeAmount > 0, "LnCollateralSystem: zero amount");

        _collateral(msg.sender, stakeCurrency, stakeAmount);
        buildBurnSystem.buildMaxFromCollateralSys(msg.sender, stakeCurrency);
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
        require(burnAmount > 0 || unstakeAmount > 0, "LnCollateralSystem: zero amount");

        if (burnAmount > 0) {
            buildBurnSystem.burnFromCollateralSys(msg.sender, burnAmount, unstakeCurrency);
        }

        if (unstakeAmount > 0) {
            _Redeem(msg.sender, unstakeCurrency, unstakeAmount);
        }
    }

    /**
     * @dev A unified function for burning lUSD and unstaking the maximum amount of collateral atomically.
     *
     * @param burnAmount Amount of lUSD to burn
     * @param unstakeCurrency ID of the collateral currency
     */
    function burnAndUnstakeMax(uint256 burnAmount, bytes32 unstakeCurrency) external whenNotPaused {
        require(burnAmount > 0, "LnCollateralSystem: zero amount");

        buildBurnSystem.burnFromCollateralSys(msg.sender, burnAmount, unstakeCurrency);
        _redeemMax(msg.sender, unstakeCurrency);
    }

    // need approve
    function Collateral(bytes32 _currency, uint256 _amount) external whenNotPaused returns (bool) {
        address user = msg.sender;
        return _collateral(user, _currency, _amount);
    }

    function _collateral(
        address user,
        bytes32 _currency,
        uint256 _amount
    ) private whenNotPaused returns (bool) {
        TokenInfo storage tokenInfo = tokenInfos[_currency];
        require(_amount > tokenInfo.minCollateral, "Collateral amount too small");
        require(tokenInfo.tokenAddr != address(0) && tokenInfo.bClose == false, "Invalid collateral");

        require(tokenInfo.tokenAddr.isContract(), "Invalid token symbol");

        IERC20 erc20 = IERC20(tokenInfo.tokenAddr);
        require(erc20.balanceOf(user) >= _amount, "insufficient balance");
        require(erc20.allowance(user, address(this)) >= _amount, "insufficient allowance, need approve more amount");

        TransferHelper.safeTransferFrom(tokenInfo.tokenAddr, user, address(this), _amount);

        userCollateralData[user][_currency].collateral = userCollateralData[user][_currency].collateral.add(_amount);
        tokenInfo.totalCollateral = tokenInfo.totalCollateral.add(_amount);

        emit CollateralLog(user, _currency, _amount, userCollateralData[user][_currency].collateral);
        return true;
    }

    /**
     * @notice This function is deprecated as it only return the boolean of whether
     * target ratio of LINA is satisfied. Use IsSatisfyTargetRatioByCurrency()` instead.
     */
    function IsSatisfyTargetRatio(address _user) public view returns (bool) {
        return IsSatisfyTargetRatioByCurrency(_user, "LINA");
    }

    function IsSatisfyTargetRatioByCurrency(address _user, bytes32 _currencySymbol) public view returns (bool) {
        (uint256 debtBalance, ) = debtSystem.GetUserDebtBalanceInUsdByCurrency(_user, _currencySymbol);
        if (debtBalance == 0) {
            return true;
        }

        uint256 buildRatio = mConfig.getUint(mConfig.getBuildRatioKey(_currencySymbol));
        uint256 collateralInUsd = GetUserCollateralInUsd(_user, _currencySymbol);
        if (collateralInUsd == 0) {
            return false;
        }
        uint256 myratio = debtBalance.divideDecimal(collateralInUsd);
        return myratio <= buildRatio;
    }

    function RedeemMax(bytes32 _currency) external whenNotPaused {
        _redeemMax(msg.sender, _currency);
    }

    function _redeemMax(address user, bytes32 _currency) private {
        _Redeem(user, _currency, maxRedeemable(user, _currency));
    }

    function _Redeem(
        address user,
        bytes32 _currency,
        uint256 _amount
    ) internal {
        TokenInfo storage tokenInfo = tokenInfos[_currency];
        require(tokenInfo.tokenAddr != address(0), "LnCollateralSystem: token address cannot zero");
        require(tokenInfo.bClose == false, "LnCollateralSystem: This token is closed");
        require(_amount > 0, "LnCollateralSystem: zero amount");

        require(_amount <= maxRedeemable(user, _currency), "LnCollateralSystem: insufficient collateral"); // Re-entrance prevention

        userCollateralData[user][_currency].collateral = userCollateralData[user][_currency].collateral.sub(_amount);

        tokenInfo.totalCollateral = tokenInfo.totalCollateral.sub(_amount);

        TransferHelper.safeTransfer(tokenInfo.tokenAddr, user, _amount);

        emit RedeemCollateral(user, _currency, _amount, userCollateralData[user][_currency].collateral);
    }

    // 1. After redeem, collateral ratio need bigger than target ratio.
    // 2. Cannot redeem more than collateral.
    function Redeem(bytes32 _currency, uint256 _amount) external whenNotPaused returns (bool) {
        address user = msg.sender;
        _Redeem(user, _currency, _amount);
        return true;
    }

    function moveCollateral(
        address fromUser,
        address toUser,
        bytes32 currency,
        uint256 amount
    ) external whenNotPaused onlyLiquidation {
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
        require(user != address(0), "LnCollateralSystem: User address cannot be zero");
        require(amount > 0, "LnCollateralSystem: Collateral amount must be > 0");

        TokenInfo storage tokeninfo = tokenInfos[currency];
        require(tokeninfo.tokenAddr != address(0), "LnCollateralSystem: Invalid token symbol");

        TransferHelper.safeTransferFrom(tokeninfo.tokenAddr, rewarder, address(this), amount);

        userCollateralData[user][currency].collateral = userCollateralData[user][currency].collateral.add(amount);
        tokeninfo.totalCollateral = tokeninfo.totalCollateral.add(amount);

        emit CollateralUnlockReward(user, currency, amount, userCollateralData[user][currency].collateral);
    }

    event UpdateTokenSetting(bytes32 symbol, address tokenAddr, uint256 minCollateral, bool close);
    event CollateralLog(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
    event RedeemCollateral(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
    event CollateralMoved(address fromUser, address toUser, bytes32 currency, uint256 amount);
    event CollateralUnlockReward(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);

    // Reserved storage space to allow for layout changes in the future.
    uint256[41] private __gap;
}
