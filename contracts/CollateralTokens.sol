pragma solidity ^0.5.17;

import "./IERC20.sol";

// 债务问题
contract CollateralTokens {
    
    struct TokenInfo {
        address tokenAddr;
        uint256 mortgageRatio;
    }

    mapping (bytes32 => TokenInfo) public tokenAddress;

    //
    struct CollateralData {
        uint256 loanAmount;
    }

    // 
    mapping (address => mapping(bytes32 => CollateralData[])) collateralData;
    constructor() public {
        tokenAddress["USDT"] = TokenInfo({tokenAddr:0xdAC17F958D2ee523a2206206994597C13D831ec7, mortgageRatio:1});//Tether USD
    }

    /**
     * TODO only owner
     * Add or update or remove token address.
     */
    function UpdateTokenAddress(bytes32 symbol, address tokenAddr, uint256 ratio) external returns (bool) {
        tokenAddress[symbol] = TokenInfo({tokenAddr:tokenAddr, mortgageRatio:ratio});
        return true;
    }

}