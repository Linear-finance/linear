// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";

contract LnEndAdmin {
    constructor() public {}

    function becomeAdmin(address target) external {
        LnAdmin(target).becomeAdmin();
    }
}
