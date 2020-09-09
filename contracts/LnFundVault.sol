// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";

contract LnFundVault is LnAdmin {
    uint mFundValue = 0;
    uint mInvestNumb = 0;
    address payable mFundReceive;
    uint mCurInvest = 0;
    mapping(address => uint) public receiveOf;


    constructor(address _admin, uint fund, uint investNumb, address payable _receive ) public LnAdmin(_admin) {
        mFundValue = fund;
        mInvestNumb = investNumb;
        mFundReceive = _receive;
    }

    function SetFundValue( uint iv ) public onlyAdmin {
        mFundValue = iv;    
    }

    function SetInvestNumb( uint iv ) public onlyAdmin{
        mInvestNumb = iv;
    }

    receive() external payable {
        require(msg.value == mFundValue );
        require( receiveOf[ msg.sender] == 0 );
        require( mCurInvest < mInvestNumb );

        receiveOf[ msg.sender ] = msg.value;
        mCurInvest = mCurInvest + 1;
        emit ReceiveFund( msg.sender, msg.value );
    }

    function claim( uint iReceive ) public {
        mFundReceive.transfer( iReceive);
        emit Claimed( mFundReceive, iReceive );
    }

    event ReceiveFund( address, uint );
    event Claimed( address, uint );
}


