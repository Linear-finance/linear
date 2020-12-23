// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./upgradeable/LnAdminUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts-upgradeable/utils/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/AddressUpgradeable.sol";
import "./SafeDecimalMath.sol";
import "./LnPrices.sol";
import "./LnAddressCache.sol";
import "./LnDebtSystem.sol";
import "./LnBuildBurnSystem.sol";
import "./LnConfig.sol";
import "./LnRewardLocker.sol";


// 单纯抵押进来
// 赎回时需要 债务率良好才能赎回， 赎回部分能保持债务率高于目标债务率
contract LnCollateralSystem is LnAdminUpgradeable, PausableUpgradeable, LnAddressCache {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using AddressUpgradeable for address;

    // -------------------------------------------------------
    // need set before system running value.
    LnPrices public priceGetter;
    LnDebtSystem public debtSystem;
    LnBuildBurnSystem public buildBurnSystem;
    LnConfig public mConfig;
    LnRewardLocker public mRewardLocker;

    bytes32 constant public Currency_ETH = "ETH";
    bytes32 constant public Currency_LINA = "LINA";
    // -------------------------------------------------------
    // uint256 public uniqueId; // use log

    struct TokenInfo {
        address tokenAddr;
        uint256 minCollateral; // min collateral amount.
        uint256 totalCollateral;
        bool bClose; // TODO : 为了防止价格波动，另外再加个折扣价?
    }


    mapping (bytes32 => TokenInfo) public tokenInfos;
    bytes32[] public tokenSymbol; // keys of tokenInfos, use to iteration

    struct CollateralData {
        uint256 collateral; // total collateral
    }

    // [user] => ([token=> collateraldata])
    mapping (address => mapping(bytes32 => CollateralData)) public userCollateralData;

    // -------------------------------------------------------

    address payable public messageSender;
    uint256 public messageVaule;

    function __LnCollateralSystem_init(address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);
    }

    function migra(address user, uint256 _amount) public onlyAdmin {
        userCollateralData[user][Currency_LINA].collateral = userCollateralData[user][Currency_LINA].collateral.add(_amount);
        tokenInfos[Currency_LINA].totalCollateral = tokenInfos[Currency_LINA].totalCollateral.add(_amount);

        emit CollateralLog(user, Currency_LINA, _amount, userCollateralData[user][Currency_LINA].collateral);
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    function setMessageSender(address payable sender) public  {
        messageSender = sender;
    }

    function setMessageVaule(uint256 valule) public  {
        messageVaule = valule;
    }

    // ------------------ system config ----------------------
    function updateAddressCache( LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        priceGetter =     LnPrices(         _addressStorage.getAddressWithRequire( "LnPrices",          "LnPrices address not valid" ));
        debtSystem =      LnDebtSystem(     _addressStorage.getAddressWithRequire( "LnDebtSystem",      "LnDebtSystem address not valid" ));
        buildBurnSystem = LnBuildBurnSystem(_addressStorage.getAddressWithRequire( "LnBuildBurnSystem", "LnBuildBurnSystem address not valid" ));
        mConfig =         LnConfig(         _addressStorage.getAddressWithRequire( "LnConfig",          "LnConfig address not valid" ) );
        mRewardLocker =   LnRewardLocker(   _addressStorage.getAddressWithRequire( "LnRewardLocker",    "LnRewardLocker address not valid" ));

        emit CachedAddressUpdated( "LnPrices",          address(priceGetter) );
        emit CachedAddressUpdated( "LnDebtSystem",      address(debtSystem) );
        emit CachedAddressUpdated( "LnBuildBurnSystem", address(buildBurnSystem) );
        emit CachedAddressUpdated( "LnConfig",          address(mConfig) );
        emit CachedAddressUpdated( "LnRewardLocker",    address(mRewardLocker) );
    }

    // delete token info? need to handle it's staking data.

    function UpdateTokenInfo(bytes32 _currency, address _tokenAddr, uint256 _minCollateral, bool _close) external onlyAdmin returns (bool) {
        require(_currency[0] != 0, "symbol cannot empty");
        require(_currency != Currency_ETH, "ETH is used by system");
        require(_tokenAddr != address(0), "token address cannot zero");
        require(_tokenAddr.isContract(), "token address is not a contract");

        if (tokenInfos[_currency].tokenAddr == address(0)) {// new token
            tokenSymbol.push(_currency);
        }

        uint256 totalCollateral = tokenInfos[_currency].totalCollateral;
        tokenInfos[_currency] = TokenInfo({tokenAddr:_tokenAddr, minCollateral:_minCollateral, totalCollateral:totalCollateral, bClose:_close});
        emit UpdateTokenSetting(_currency, _tokenAddr, _minCollateral, _close);
        return true;
    }

    // ------------------------------------------------------------------------
    function GetSystemTotalCollateralInUsd() public view returns (uint256 rTotal) {
        for (uint256 i=0; i< tokenSymbol.length; i++) {
            bytes32 currency = tokenSymbol[i];
            if (tokenInfos[currency].totalCollateral > 0) { // this check for avoid calling getPrice when collateral is zero
                if (Currency_LINA == currency) {
                    uint256 totallina = tokenInfos[currency].totalCollateral.add(mRewardLocker.totalNeedToReward());
                    rTotal = rTotal.add( totallina.multiplyDecimal(priceGetter.getPrice(currency)) );
                } else {
                    rTotal = rTotal.add( tokenInfos[currency].totalCollateral.multiplyDecimal(priceGetter.getPrice(currency)) );
                }
            }
        }

        if (address(this).balance > 0) {
            rTotal = rTotal.add(address(this).balance.multiplyDecimal(priceGetter.getPrice(Currency_ETH)));
        }
    }

    function GetUserTotalCollateralInUsd(address _user) public view returns (uint256 rTotal) {
        for (uint256 i=0; i< tokenSymbol.length; i++) {
            bytes32 currency = tokenSymbol[i];
            if (userCollateralData[_user][currency].collateral > 0) {
                if (Currency_LINA == currency) {
                    uint256 totallina = userCollateralData[_user][currency].collateral.add(mRewardLocker.balanceOf(_user));
                    rTotal = rTotal.add( totallina.multiplyDecimal(priceGetter.getPrice(currency)) );
                } else {
                    rTotal = rTotal.add( userCollateralData[_user][currency].collateral.multiplyDecimal(priceGetter.getPrice(currency)) );
                }
            }
        }

        if (userCollateralData[_user][Currency_ETH].collateral > 0) {
            rTotal = rTotal.add( userCollateralData[_user][Currency_ETH].collateral.multiplyDecimal(priceGetter.getPrice(Currency_ETH)) );
        }
    }

    function GetUserCollateral(address _user, bytes32 _currency) external view returns (uint256) {
        if (Currency_LINA != _currency) {
            return userCollateralData[_user][_currency].collateral;
        }
        return mRewardLocker.balanceOf(_user).add(userCollateralData[_user][_currency].collateral);
    }

    // NOTE: LINA collateral not include reward in locker
    function GetUserCollaterals(address _user) external view returns (bytes32[] memory, uint256[] memory) {
        bytes32[] memory rCurrency = new bytes32[](tokenSymbol.length + 1);
        uint256[] memory rAmount = new uint256[](tokenSymbol.length + 1);
        uint256 retSize = 0;
        for (uint256 i=0; i < tokenSymbol.length; i++) {
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

    // need approve
    function Collateral(bytes32 _currency, uint256 _amount) external whenNotPaused returns (bool) {
        require(tokenInfos[_currency].tokenAddr.isContract(), "Invalid token symbol");
        TokenInfo storage tokeninfo = tokenInfos[_currency];
        require(_amount > tokeninfo.minCollateral, "Collateral amount too small");
        require(tokeninfo.bClose == false, "This token is closed");

        address user = msg.sender;
        user = user.isContract()? messageSender : user;

        IERC20 erc20 = IERC20(tokenInfos[_currency].tokenAddr);
        require(erc20.balanceOf(user) >= _amount, "insufficient balance");
        require(erc20.allowance(user, address(this)) >= _amount, "insufficient allowance, need approve more amount");

        erc20.transferFrom(user, address(this), _amount);

        userCollateralData[user][_currency].collateral = userCollateralData[user][_currency].collateral.add(_amount);
        tokeninfo.totalCollateral = tokeninfo.totalCollateral.add(_amount);

        emit CollateralLog(user, _currency, _amount, userCollateralData[user][_currency].collateral);
        return true;
    }

    function IsSatisfyTargetRatio(address _user) public view returns(bool) {
        (uint256 debtBalance, ) = debtSystem.GetUserDebtBalanceInUsd(_user);
        if (debtBalance == 0) {
            return true;
        }

        uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        uint256 totalCollateralInUsd = GetUserTotalCollateralInUsd(_user);
        if (totalCollateralInUsd == 0) {
            return false;
        }
        uint256 myratio = debtBalance.divideDecimal(totalCollateralInUsd);
        return myratio <= buildRatio;
    }

    // 满足最低抵押率的情况下可最大赎回的资产 TODO: return multi value
    function MaxRedeemableInUsd(address _user) public view returns (uint256) {
        uint256 totalCollateralInUsd = GetUserTotalCollateralInUsd(_user);
        
        (uint256 debtBalance, ) = debtSystem.GetUserDebtBalanceInUsd(_user);
        if (debtBalance == 0) {
            return totalCollateralInUsd;
        }

        uint256 buildRatio = mConfig.getUint(mConfig.BUILD_RATIO());
        uint256 minCollateral = debtBalance.divideDecimal(buildRatio);
        if (totalCollateralInUsd < minCollateral) {
            return 0;
        }
        
        return totalCollateralInUsd.sub(minCollateral);
    }

    function MaxRedeemable(address user, bytes32 _currency) public view returns(uint256) {
        uint256 maxRedeemableInUsd = MaxRedeemableInUsd(user);
        uint256 maxRedeem = maxRedeemableInUsd.divideDecimal(priceGetter.getPrice(_currency));
        if (maxRedeem > userCollateralData[user][_currency].collateral) {
            maxRedeem = userCollateralData[user][_currency].collateral;
        }
        if (Currency_LINA != _currency) {
            return maxRedeem;
        }
        uint256 lockedLina = mRewardLocker.balanceOf(user);
        if (maxRedeem <= lockedLina) {
            return 0;
        }
        return maxRedeem.sub(lockedLina);
    }

    function RedeemMax(bytes32 _currency) external whenNotPaused {
        address user = msg.sender;
        uint256 maxRedeem = MaxRedeemable(user, _currency);
        _Redeem(user, _currency, maxRedeem);
    }

    function _Redeem(address user, bytes32 _currency, uint256 _amount) internal {
        require(_amount <= userCollateralData[user][_currency].collateral, "Can not redeem more than collateral");
        require(_amount > 0, "Redeem amount need larger than zero");

        uint256 maxRedeemableInUsd = MaxRedeemableInUsd(user);
        uint256 maxRedeem = maxRedeemableInUsd.divideDecimal(priceGetter.getPrice(_currency));
        require(_amount <= maxRedeem, "Because lower collateral ratio, can not redeem too much");

        userCollateralData[user][_currency].collateral = userCollateralData[user][_currency].collateral.sub(_amount);

        TokenInfo storage tokeninfo = tokenInfos[_currency];
        tokeninfo.totalCollateral = tokeninfo.totalCollateral.sub(_amount);

        IERC20(tokenInfos[_currency].tokenAddr).transfer(user, _amount);

        emit RedeemCollateral(user, _currency, _amount, userCollateralData[user][_currency].collateral);
    }

    // 1. After redeem, collateral ratio need bigger than target ratio.
    // 2. Cannot redeem more than collateral.
    function Redeem(bytes32 _currency, uint256 _amount) public whenNotPaused returns (bool) {
        address user = msg.sender;
        user = user.isContract()? messageSender : user;
        _Redeem(user, _currency, _amount);
        return true;
    }

    receive() external whenNotPaused payable {
        address user = msg.sender;
        user = user.isContract()? messageSender : user;
        uint256 ethAmount = msg.value;
        _CollateralEth(user, ethAmount);
    }

    function _CollateralEth(address user, uint256 ethAmount) internal {
        require(ethAmount > 0, "ETH amount need more than zero");

        userCollateralData[user][Currency_ETH].collateral = userCollateralData[user][Currency_ETH].collateral.add(ethAmount);

        emit CollateralLog(user, Currency_ETH, ethAmount, userCollateralData[user][Currency_ETH].collateral);
    }

    // payable eth receive,
    function CollateralEth() external payable whenNotPaused returns (bool) {
        address user = msg.sender;
        uint256 ethAmount = msg.value;
        if ( user.isContract() ){
            user = messageSender;
            ethAmount = messageVaule;
        }
        _CollateralEth(user, ethAmount);
        return true;
    }

    function RedeemETH(uint256 _amount) external whenNotPaused returns (bool) {

        address payable user;
        address addr = msg.sender;
        if (addr.isContract()){
            user = messageSender;
        } else {
            user = msg.sender;
        }

        require(_amount <= userCollateralData[user][Currency_ETH].collateral, "Can not redeem more than collateral");
        require(_amount > 0, "Redeem amount need larger than zero");

        uint256 maxRedeemableInUsd = MaxRedeemableInUsd(user);

        uint256 maxRedeem = maxRedeemableInUsd.divideDecimal(priceGetter.getPrice(Currency_ETH));
        require(_amount <= maxRedeem, "Because lower collateral ratio, can not redeem too much");

        userCollateralData[user][Currency_ETH].collateral = userCollateralData[user][Currency_ETH].collateral.sub(_amount);
        user.transfer(_amount);

        emit RedeemCollateral(user, Currency_ETH, _amount, userCollateralData[user][Currency_ETH].collateral);
        return true;
    }

    event UpdateTokenSetting(bytes32 symbol, address tokenAddr, uint256 minCollateral, bool close);
    event CollateralLog(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
    event RedeemCollateral(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);

    // Reserved storage space to allow for layout changes in the future.
    uint256[41] private __gap;
}