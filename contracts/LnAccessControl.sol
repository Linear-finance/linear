// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";

// contract access control
contract LnAccessControl is AccessControl {
    using Address for address;

    // -------------------------------------------------------
    // role type
    bytes32 public constant ISSUE_LUSD_ROLE = keccak256("ISSUE_LUSD"); // issue lusd
    bytes32 public constant BURN_LUSD_ROLE = keccak256("BURN_LUSD"); // burn lusd

    bytes32 public constant DEBT_SYSTEM = keccak256("LnDebtSystem");
    // -------------------------------------------------------
    constructor() public {
        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    function IsAdmin(address _address) public view returns (bool) {
        return hasRole(DEFAULT_ADMIN_ROLE, _address);
    }

    function SetAdmin(address _address) public returns (bool) {
        require(IsAdmin(msg.sender), "Only admin");

        _setupRole(DEFAULT_ADMIN_ROLE, _address);
    }

    // -------------------------------------------------------
    function _setRoles(bytes32 roleType, address[] calldata addresses, bool[] calldata setTo) private {
        require(addresses.length == setTo.length, "parameter address length not eq");

        for (uint256 i=0; i < addresses.length; i++) {
            //require(addresses[i].isContract(), "Role address need contract only");
            if (setTo[i]) {
                grantRole(roleType, addresses[i]);
            } else {
                revokeRole(roleType, addresses[i]);
            }
        }
    }

    // Issue burn
    function SetIssueLusdRole(address[] calldata issuer, bool[] calldata setTo) public {
        //require(IsAdmin(msg.sender), "Only admin"); //TODO grantRole has check admin role require, but need test to make it sure
        
        _setRoles(ISSUE_LUSD_ROLE, issuer, setTo);
    }

    function SetBurnLusdRole(address[] calldata burner, bool[] calldata setTo) public {
        _setRoles(BURN_LUSD_ROLE, burner, setTo);
    }

    function HasIssueLusdRole(address _address) public view returns (bool) {
        return hasRole(ISSUE_LUSD_ROLE, _address);
    } 

    function HasBurnLusdRole(address _address) public view returns (bool) {
        return hasRole(BURN_LUSD_ROLE, _address);
    }
    
    //
    function SetDebtSystemRole(address[] calldata _address, bool[] calldata _setTo) public {
        _setRoles(DEBT_SYSTEM, _address, _setTo);
    }

    function HasDebtSystemRole(address _address) public view returns (bool) {
        return hasRole(DEBT_SYSTEM, _address);
    }
}
