// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./interfaces/ILnAddressStorage.sol";

abstract contract LnAddressCache {
    function updateAddressCache(ILnAddressStorage _addressStorage) external virtual;

    event CachedAddressUpdated(bytes32 name, address addr);
}
