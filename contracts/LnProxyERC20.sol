// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnProxyImpl.sol";
import "./IERC20.sol";

contract LnProxyERC20 is LnProxyBase, IERC20 {
    constructor(address _admin) public LnProxyBase(_admin) {}

    function name() public view override returns (string memory) {
        
        return IERC20(address(target)).name();
    }

    function symbol() public view override returns (string memory) {
        
        return IERC20(address(target)).symbol();
    }

    function decimals() public view override returns (uint8) {
        
        return IERC20(address(target)).decimals();
    }

    function totalSupply() public view override returns (uint256) {
        
        return IERC20(address(target)).totalSupply();
    }

    function balanceOf(address account) public view override returns (uint256) {
        
        return IERC20(address(target)).balanceOf(account);
    }

    function allowance(address owner, address spender) public view override returns (uint256) {
        
        return IERC20(address(target)).allowance(owner, spender);
    }

    function transfer(address to, uint256 value) public override returns (bool) {
        
        target.setMessageSender(msg.sender);

        IERC20(address(target)).transfer(to, value);

        return true;
    }

    function approve(address spender, uint256 value) public override returns (bool) {
        
        target.setMessageSender(msg.sender);

        IERC20(address(target)).approve(spender, value);

        return true;
    }

    function transferFrom(
        address from,
        address to,
        uint256 value
    ) public override returns (bool) {
        
        target.setMessageSender(msg.sender);

        IERC20(address(target)).transferFrom(from, to, value);

        return true;
    }
}

