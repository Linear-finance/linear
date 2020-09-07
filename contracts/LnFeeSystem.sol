// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";

contract LnFeeSystem is LnAdmin {

    address public constant FEE_DUMMY_ADDRESS = address(0x2048);

    constructor(address _admin ) public LnAdmin(_admin ) {
    }

    function addExchangeFee( uint feeUsd ) public {
        emit ExchangeFee( feeUsd );
    }

    event ExchangeFee( uint feeUsd );
}

