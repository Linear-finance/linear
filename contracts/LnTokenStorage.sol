// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";
import "./LnOperatorModifier.sol";

contract LnTokenStorage is LnAdmin, LnOperatorModifier {
    
    mapping(address => uint) public balanceOf;
    mapping(address => mapping(address => uint)) public allowance;

    constructor(address _admin, address _operator) public LnAdmin(_admin) LnOperatorModifier(_operator) {}

    function setAllowance(address tokenOwner, address spender, uint value) external onlyOperator {
        allowance[tokenOwner][spender] = value;
    }

    function setBalanceOf(address account, uint value) external onlyOperator {
        balanceOf[account] = value;
    }
}

// add storage lock
contract LnTokenStorageLock is LnAdmin {
    address public operator;
    address mOpNew;
    uint mLock;
    LnTokenStorage mStorage;

    constructor(address _admin, address _operator, LnTokenStorage store) public LnAdmin(_admin) {
        mStorage = store;
        operator = _operator;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Only operator can perform this action 2");
        _;
    }

    function setOperator( address op, uint time ) public onlyAdmin {
        mLock = time;
        mOpNew = op;
    }

    function _updateOperator() internal {
        if( mOpNew != address(0) ) {
            if( now > mLock ){
                operator = mOpNew;
                mOpNew = address(0);
            }
        }
    }

    function setAllowance(address tokenOwner, address spender, uint value) external onlyOperator {
        _updateOperator();
        mStorage.setAllowance( tokenOwner, spender, value );        
    }

    function setBalanceOf(address account, uint value) external onlyOperator {
        _updateOperator();
        mStorage.setBalanceOf( account, value );        
    }

    function allowance(address owner, address spender) public view returns(uint) {
        return mStorage.allowance(owner, spender);
    }

    function balanceOf(address account) external view returns(uint) {
        return mStorage.balanceOf(account);
    }
}