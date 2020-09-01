// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";

// updatable, add interface and proxy
// 债务问题
// 价差能套利？
// 有什么数据需要统计
contract CollateralTokens is LnAdmin {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    struct TokenInfo {
        address tokenAddr;
        uint256 mortgageRatio; // 1000 base, 0 to close
    }

    mapping (bytes32 => TokenInfo) public tokenAddress;

    struct CollateralData { // hwo to pay for interest? 抵押物不足以偿还利息？ 
        uint256 loanId;
        uint256 collateral; 
        uint256 borrow; 
        uint256 loanTime;
    }

    // [user] => ([token=> collateraldata])
    mapping (address => mapping(bytes32 => CollateralData[])) public collateralData;

    uint256 public interestPerSecond = uint256(5).mul(SafeDecimalMath.preciseUnit()).div(365*24*3600);

    constructor() public LnAdmin(msg.sender) {
        // configure out size
        //tokenAddress["USDT"] = TokenInfo({tokenAddr:0xdAC17F958D2ee523a2206206994597C13D831ec7, mortgageRatio:800});
        //tokenAddress["DAI"] = TokenInfo({tokenAddr:0x6B175474E89094C44Da98b954EedeAC495271d0F, mortgageRatio:500});
    }

    function updateTokenInfo(bytes32 symbol, address tokenAddr, uint256 mortRatio) private returns (bool) {
        tokenAddress[symbol] = TokenInfo({tokenAddr:tokenAddr, mortgageRatio:mortRatio});
        return true;
    }

    function UpdateTokenInfo(bytes32 symbol, address tokenAddr, uint256 mortRatio) external onlyAdmin returns (bool) {
        return updateTokenInfo(symbol, tokenAddr, mortRatio);
    }

    function UpdateTokenInfos(bytes32[] calldata symbols, address[] calldata tokenAddrs, uint256[] calldata mortRatios) external onlyAdmin returns (bool) {
        require(symbols.length == tokenAddrs.length, "");
        require(symbols.length == mortRatios.length, "");
        for (uint256 i=0; i < symbols.length; i++) {
            updateTokenInfo(symbols[i], tokenAddrs[i], mortRatios[i]);
        }

        return true;
    }

    /**
     * 首先this要有lina的token
     * 根据抵押率和汇率算出能贷到多少 lina proxy.
     */
    function TakeOutALoan() external returns (bool) {

        return true;
    }

    function RepayALoan() external returns (bool) {

        return true;
    }
}