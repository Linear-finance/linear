// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./SafeDecimalMath.sol";
import "./LnDefaultPrices.sol";
import "./LnAddressCache.sol";
import "./LnDebtSystem.sol";
import "./LnBuildBurnSystem.sol";

// TODO 价格比例
// 单纯抵押进来
// 赎回时需要 债务率良好才能赎回， 赎回部分能保持债务率高于目标债务率
contract LnCollateralSystem is LnAdmin, Pausable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Address for address;

    // -------------------------------------------------------
    // need set before system running value.
    LnAddressStorage private addressStorage;
    bytes32 constant Currency_ETH = "ETH";
    
    // -------------------------------------------------------
    uint256 public uniqueId; // use log

    struct TokenInfo {
        address tokenAddr;
        uint256 minCollateral; // min collateral amount.
        uint256 totalCollateral;
        bool bClose;
    }

    mapping (bytes32 => TokenInfo) public tokenInfos;
    bytes32[] public tokenSymbol; // keys of tokenInfos, use to iteration

    struct CollateralData {
        uint256 collateral; // total collateral
    }

    // [user] => ([token=> collateraldata])
    mapping (address => mapping(bytes32 => CollateralData)) public userCollateralData;

    // -------------------------------------------------------
    constructor(address _addrStorage) public LnAdmin(msg.sender) {
        addressStorage = LnAddressStorage(_addrStorage);
    }

    // ------------------ system config ----------------------
    function SetAddressStorage(address _address) public onlyAdmin {
        emit UpdateAddressStorage(address(addressStorage), _address);
        addressStorage = LnAddressStorage(_address);
    }

    function SetPause(bool pause) external onlyAdmin {
        if (pause) {
            _pause();
        } else {
            _unpause();
        }
    }

    function updateTokenInfo(bytes32 _currency, address _tokenAddr, uint256 _minCollateral, bool _close) private returns (bool) {
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

    // delete token info? need to handle it's staking data.

    function UpdateTokenInfo(bytes32 _currency, address _tokenAddr, uint256 _minCollateral, bool _close) external onlyAdmin returns (bool) {
        return updateTokenInfo(_currency, _tokenAddr, _minCollateral, _close);
    }

    function UpdateTokenInfos(bytes32[] calldata _symbols, address[] calldata _tokenAddrs, uint256[] calldata _minCollateral, bool[] calldata _closes) external onlyAdmin returns (bool) {
        require(_symbols.length == _tokenAddrs.length, "length of array not eq");
        require(_symbols.length == _minCollateral.length, "length of array not eq");
        require(_symbols.length == _closes.length, "length of array not eq");

        for (uint256 i=0; i < _symbols.length; i++) {
            updateTokenInfo(_symbols[i], _tokenAddrs[i], _minCollateral[i], _closes[i]);
        }

        return true;
    }

    // ------------------------------------------------------------------------
    function GetSystemTotalCollateralInUsd() public view returns (uint256 rTotal) {
        LnDefaultPrices priceGetter = LnDefaultPrices(addressStorage.getAddress("LnDefaultPrices"));
        for (uint256 i=0; i< tokenSymbol.length; i++) {
            bytes32 currency = tokenSymbol[i];
            if (tokenInfos[currency].totalCollateral > 0) { // this check for avoid calling getPrice when collateral is zero
                rTotal = rTotal.add( tokenInfos[currency].totalCollateral.mul(priceGetter.getPrice(currency)) );
            }
        }

        if (address(this).balance > 0) {
            rTotal = rTotal.add(address(this).balance.mul(priceGetter.getPrice(Currency_ETH)));
        }
    }

    function GetUserTotalCollateralInUsd(address _user) public view returns (uint256 rTotal) {
        LnDefaultPrices priceGetter = LnDefaultPrices(addressStorage.getAddress("LnDefaultPrices"));
        for (uint256 i=0; i< tokenSymbol.length; i++) {
            bytes32 currency = tokenSymbol[i];
            if (userCollateralData[_user][currency].collateral > 0) {
                rTotal = rTotal.add( userCollateralData[_user][currency].collateral.mul(priceGetter.getPrice(currency)) );
            }
        }

        if (userCollateralData[_user][Currency_ETH].collateral > 0) {
            rTotal = rTotal.add( userCollateralData[_user][Currency_ETH].collateral.mul(priceGetter.getPrice(Currency_ETH)) );
        }
    }

    function GetUserCollateral(address _user, bytes32 _currency) external view returns (uint256) {
        return userCollateralData[_user][_currency].collateral;
    }

    // need approve
    function AddCollateral(bytes32 _currency, uint256 _amount) external whenNotPaused returns (bool) {
        require(tokenInfos[_currency].tokenAddr.isContract(), "Invalid token symbol");
        TokenInfo storage tokeninfo = tokenInfos[_currency];
        require(_amount > tokeninfo.minCollateral, "Collateral amount too small");
        require(tokeninfo.bClose == false, "This token is closed");

        address user = msg.sender;

        IERC20(tokenInfos[_currency].tokenAddr).transferFrom(user, address(this), _amount);

        userCollateralData[user][_currency].collateral = userCollateralData[user][_currency].collateral.add(_amount);
        tokeninfo.totalCollateral = tokeninfo.totalCollateral.add(_amount);

        emit AddCollateralLog(user, _currency, _amount, userCollateralData[user][_currency].collateral);
        return true;
    }

    // 满足最低抵押率的情况下可最大赎回的资产 TODO: return multi value
    function MaxRedeemableInUsd(address _user) public view returns (uint256) {
        uint256 totalCollateralInUsd = GetUserTotalCollateralInUsd(_user);
        
        LnDebtSystem debtSystem = LnDebtSystem(addressStorage.getAddress("LnDebtSystem"));
        LnBuildBurnSystem bbSys = LnBuildBurnSystem(addressStorage.getAddress("LnBuildBurnSystem"));

        uint256 debtBalance = debtSystem.GetUserDebtBalanceInUsd(_user);
        if (debtBalance == 0) {
            return totalCollateralInUsd;
        }

        uint256 minCollateral = debtBalance.divideDecimal(bbSys.BuildRatio());
        if (totalCollateralInUsd < minCollateral) {
            return 0;
        }
        
        return totalCollateralInUsd.sub(minCollateral);
    }

    // 1. After redeem, collateral ratio need bigger than target ratio.
    // 2. Cannot redeem more than collateral.
    function Redeem(bytes32 _currency, uint256 _amount) external whenNotPaused returns (bool) {
        address user = msg.sender;
        require(_amount <= userCollateralData[user][_currency].collateral, "Can not redeem more than collateral");
        require(_amount > 0, "Redeem amount need larger than zero");

        uint256 maxRedeemableInUsd = MaxRedeemableInUsd(user);
        
        LnDefaultPrices priceGetter = LnDefaultPrices(addressStorage.getAddress("LnDefaultPrices"));
        uint256 maxRedeem = maxRedeemableInUsd.div(priceGetter.getPrice(_currency));
        require(_amount <= maxRedeem, "Because lower collateral ratio, can not redeem too much");

        userCollateralData[user][_currency].collateral = userCollateralData[user][_currency].collateral.sub(_amount);

        TokenInfo storage tokeninfo = tokenInfos[_currency];
        tokeninfo.totalCollateral = tokeninfo.totalCollateral.sub(_amount);

        IERC20(tokenInfos[_currency].tokenAddr).transfer(user, _amount);

        emit RedeemCollateral(user, _currency, _amount, userCollateralData[user][_currency].collateral);
        return true;
    }

    // payable eth receive, 
    function CollateralEth() external payable whenNotPaused returns (bool) {
        address user = msg.sender;
        uint256 ethAmount = msg.value;
        require(ethAmount > 0, "ETH amount need more than zero");
        
        userCollateralData[user][Currency_ETH].collateral = userCollateralData[user][Currency_ETH].collateral.add(ethAmount);

        emit AddCollateralLog(user, Currency_ETH, ethAmount, userCollateralData[user][Currency_ETH].collateral);
        return true;
    }

    function RedeemETH(uint256 _amount) external whenNotPaused returns (bool) {
        address payable user = msg.sender;
        require(_amount <= userCollateralData[user][Currency_ETH].collateral, "Can not redeem more than collateral");
        require(_amount > 0, "Redeem amount need larger than zero");

        uint256 maxRedeemableInUsd = MaxRedeemableInUsd(user);
        
        LnDefaultPrices priceGetter = LnDefaultPrices(addressStorage.getAddress("LnDefaultPrices"));
        uint256 maxRedeem = maxRedeemableInUsd.div(priceGetter.getPrice(Currency_ETH));
        require(_amount <= maxRedeem, "Because lower collateral ratio, can not redeem too much");

        userCollateralData[user][Currency_ETH].collateral = userCollateralData[user][Currency_ETH].collateral.sub(_amount);
        user.transfer(_amount);

        emit RedeemCollateral(user, Currency_ETH, _amount, userCollateralData[user][Currency_ETH].collateral);
        return true;
    }

    event UpdateAddressStorage(address oldAddr, address newAddr);
    event UpdateTokenSetting(bytes32 symbol, address tokenAddr, uint256 minCollateral, bool close);
    event AddCollateralLog(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
    event RedeemCollateral(address user, bytes32 _currency, uint256 _amount, uint256 _userTotal);
}
