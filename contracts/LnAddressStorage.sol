// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./interfaces/ILnAddressStorage.sol";
import "./upgradeable/LnAdminUpgradeable.sol";

contract LnAddressStorage is LnAdminUpgradeable, ILnAddressStorage {
    mapping(bytes32 => address) public mAddrs;

    function __LnAddressStorage_init(address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);
    }

    function updateAll(bytes32[] calldata names, address[] calldata destinations) external override onlyAdmin {
        require(names.length == destinations.length, "Input lengths must match");

        for (uint i = 0; i < names.length; i++) {
            mAddrs[names[i]] = destinations[i];
            emit StorageAddressUpdated(names[i], destinations[i]);
        }
    }

    function update(bytes32 name, address dest) external override onlyAdmin {
        require(name != "", "name can not be empty");
        require(dest != address(0), "address cannot be 0");
        mAddrs[name] = dest;
        emit StorageAddressUpdated(name, dest);
    }

    function getAddress(bytes32 name) external view override returns (address) {
        return mAddrs[name];
    }

    function getAddressWithRequire(bytes32 name, string calldata reason) external view override returns (address) {
        address _foundAddress = mAddrs[name];
        require(_foundAddress != address(0), reason);
        return _foundAddress;
    }

    event StorageAddressUpdated(bytes32 name, address addr);

    // Reserved storage space to allow for layout changes in the future.
    uint256[49] private __gap;
}
