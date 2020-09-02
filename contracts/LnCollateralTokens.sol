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

// updatable, add interface and proxy
// 债务问题, 每次贷款用独立的
// 价差能套利？
// 有什么数据需要统计
contract LnCollateralTokens is LnAdmin, Pausable {
    using SafeMath for uint;
    using SafeDecimalMath for uint;
    using Address for address;

    // -------------------------------------------------------
    // need set before system running value.
    LnAddressStorage private addressStorage;
    IERC20 private lUSDToken; // this contract need 
    
    // -------------------------------------------------------
    uint256 private constant MORTGAGE_BASE = 1000;
    uint256 private constant ONE_YEAR = 365*24*3600;

    uint256 public uniqueId;

    //
    struct TokenInfo {
        address tokenAddr;
        uint256 mortgageRatio; // MORTGAGE_BASE base, 0 to close
        uint256 minCollateral; // min collateral amount.
    }

    mapping (bytes32 => TokenInfo) public tokenAddress;
    bytes32[] public tokenSymbol;

    struct CollateralData { // hwo to pay for interest? 抵押物不足以偿还利息？ 
        uint256 loanId;
        uint256 collateral; 
        uint256 borrow; 
        uint256 loanTime;
    }

    // [user] => ([token=> collateraldata])
    mapping (address => mapping(bytes32 => CollateralData[])) public userCollateralData;

    uint256 public interestPerSecond = uint256(5).mul(SafeDecimalMath.preciseUnit()).div(ONE_YEAR);

    // -------------------------------------------------------
    constructor(address _addrStorage, address _lUSDTokenAddr) public LnAdmin(msg.sender) {
        addressStorage = LnAddressStorage(_addrStorage);
        lUSDToken = IERC20(_lUSDTokenAddr);
    }

    // ------------------ system config ----------------------
    function SetAddressStorage(address _address) public onlyAdmin {
        emit UpdateAddressStorage(address(addressStorage), _address);
        addressStorage = LnAddressStorage(_address);
    }

    function SetLusdTokenAddress(address _address) public onlyAdmin {
        emit UpdateLusdToken(address(lUSDToken), _address);
        lUSDToken = IERC20(_address);
    }

    function updateTokenInfo(bytes32 _symbol, address _tokenAddr, uint256 _mortgageRatio, uint256 _minCollateral) private returns (bool) {
        require(_symbol[0] != 0, "symbol cannot empty");
        require(_tokenAddr.isContract(), "token address is not a contract");
        require(_mortgageRatio <= MORTGAGE_BASE, "Mortgage ratio must less then MORTGAGE_BASE");

        tokenAddress[_symbol] = TokenInfo({tokenAddr:_tokenAddr, mortgageRatio:_mortgageRatio, minCollateral:_minCollateral});
        emit UpdateTokenSetting(_symbol, _tokenAddr, _mortgageRatio, _minCollateral);
        return true;
    }

    function UpdateTokenInfo(bytes32 _symbol, address _tokenAddr, uint256 _mortgageRatio, uint256 _minCollateral) external onlyAdmin returns (bool) {
        return updateTokenInfo(_symbol, _tokenAddr, _mortgageRatio, _minCollateral);
    }

    function UpdateTokenInfos(bytes32[] calldata _symbols, address[] calldata _tokenAddrs, uint256[] calldata _mortRatios, uint256[] calldata _minCollateral) external onlyAdmin returns (bool) {
        require(_symbols.length == _tokenAddrs.length, "length of array not eq");
        require(_symbols.length == _mortRatios.length, "length of array not eq");
        require(_symbols.length == _minCollateral.length, "length of array not eq");

        for (uint256 i=0; i < _symbols.length; i++) {
            updateTokenInfo(_symbols[i], _tokenAddrs[i], _mortRatios[i], _minCollateral[i]);
        }

        return true;
    }

    function SetPause(bool pause) external onlyAdmin {
        if (pause) {
            _pause();
        } else {
            _unpause();
        }
    }

    // ------------------ public interface ----------------------
    /**
     * 1. approve this contract to transfer contract
     * 
     * 
     */
    function TakeOutALoan(bytes32 _symbol, uint256 _collateral) external whenNotPaused  
        returns (uint256 loanId,
                 uint256 collateral,
                 uint256 borrow,
                 uint256 loanTime) {
        require(tokenAddress[_symbol].tokenAddr.isContract(), "Invalid token symbol");
        require(_collateral > tokenAddress[_symbol].minCollateral);

        uint256 tokenValueUSD = _collateral * LnDefaultPrices(addressStorage.getAddress("LnDefaultPrices")).getPrice(_symbol); // TODO: becarefor calc unit
        borrow = tokenValueUSD * tokenAddress[_symbol].mortgageRatio / MORTGAGE_BASE;

        IERC20(tokenAddress[_symbol].tokenAddr).transferFrom(msg.sender, address(this), _collateral);
        //TODO issue lusd
        //TODO update debt

        loanId = ++uniqueId;
        loanTime = block.timestamp;

        //
        CollateralData memory collateralData = CollateralData({
            loanId: uniqueId,
            collateral: collateral,
            borrow: borrow, 
            loanTime: loanTime
        });

        userCollateralData[msg.sender][_symbol].push(collateralData);
    }

    function RepayALoan(bytes32 _symbol, uint256 index) external whenNotPaused returns (bool) {

        return true;
    }

    function GetLoanIds(address _address, bytes32 _symbol) public view returns (uint256[] memory) {
        uint256[] memory ids = new uint256[](userCollateralData[_address][_symbol].length);
        for (uint256 i=0; i < userCollateralData[_address][_symbol].length; i++) {
            ids[i] = userCollateralData[_address][_symbol][i].loanId;
        }
        return ids;
    }

    event UpdateLusdToken(address oldAddr, address newAddr);
    event UpdateAddressStorage(address oldAddr, address newAddr);
    event UpdateTokenSetting(bytes32 symbol, address tokenAddr, uint256 mortgageRatio, uint256 minCollateral);
}