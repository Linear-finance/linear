pragma solidity ^0.5.17;

import "./LnAdmin.sol";
import "./LnOperatorModifier.sol";

contract LnTokenStorage is LnAdmin, LnOperatorModifier {
    
    mapping(address => uint) public balanceOf;
    mapping(address => mapping(address => uint)) public allowance;

    constructor(address _owner, address _associatedContract) public LnAdmin(_owner) LnOperatorModifier(_associatedContract) {}

    function setAllowance(
        address tokenOwner,
        address spender,
        uint value
    ) external onlyAssociatedContract {
        allowance[tokenOwner][spender] = value;
    }

    function setBalanceOf(address account, uint value) external onlyAssociatedContract {
        balanceOf[account] = value;
    }
}

