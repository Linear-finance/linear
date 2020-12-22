// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;


import "./LnAdmin.sol";

contract LnAddressStorage is LnAdmin {

    mapping(bytes32 => address) public mAddrs;

    constructor(address _admin ) public LnAdmin(_admin ) {}


    function updateAll(bytes32[] calldata names, address[] calldata destinations) external onlyAdmin {
        require(names.length == destinations.length, "Input lengths must match");

        for (uint i = 0; i < names.length; i++) {
            mAddrs[names[i]] = destinations[i];
            emit StorageAddressUpdated( names[i], destinations[i] );
        }
    }

    function update(bytes32 name, address dest ) external onlyAdmin {
        require( name != "", "name can not be empty");
        require( dest != address(0), "address cannot be 0");
        mAddrs[name] = dest;
        emit StorageAddressUpdated( name, dest );
    }

    function getAddress(bytes32 name) external view returns (address) {
        return mAddrs[name];
    }

    function getAddressWithRequire(bytes32 name, string calldata reason) external view returns (address) {
        address _foundAddress = mAddrs[name];
        require(_foundAddress != address(0), reason);
        return _foundAddress;
    }
    event StorageAddressUpdated( bytes32 name, address addr );
}


interface LnAddressCache  {
    function updateAddressCache( LnAddressStorage _addressStorage )  external ;

    event   CachedAddressUpdated( bytes32 name, address addr );
}

contract testAddressCache  is LnAddressCache, LnAdmin {
    address public addr1;
    address public addr2;
    
    constructor(address _admin ) public LnAdmin(_admin ) {}


    function updateAddressCache( LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        addr1 = LnAddressStorage(_addressStorage).getAddressWithRequire("a", "");
        addr2 = LnAddressStorage(_addressStorage).getAddressWithRequire("b", "" );
        emit CachedAddressUpdated( "a", addr1 );
        emit CachedAddressUpdated( "b", addr2 );
    }

}