// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/access/AccessControl.sol";
import "@openzeppelin/contracts/utils/Address.sol";

// example:
//LnAccessControl accessCtrl = LnAccessControl(addressStorage.getAddress("LnAccessControl"));
//require(accessCtrl.hasRole(accessCtrl.DEBT_SYSTEM(), _address), "Need debt system access role");

// contract access control
contract LnAccessControl is AccessControl {
    using Address for address;

    // -------------------------------------------------------
    // role type
    bytes32 public constant ISSUE_ASSET_ROLE = keccak256("ISSUE_ASSET");
    bytes32 public constant BURN_ASSET_ROLE = keccak256("BURN_ASSET");

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
    // this func need admin role. grantRole and revokeRole need admin role
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

    // function SetRoles(bytes32 roleType, address[] calldata addresses, bool[] calldata setTo) public {
    //     _setRoles(roleType, addresses, setTo);
    // }

    // Issue burn
    function SetIssueAssetRole(address[] calldata issuer, bool[] calldata setTo) public {
        _setRoles(ISSUE_ASSET_ROLE, issuer, setTo);
    }

    function SetBurnAssetRole(address[] calldata burner, bool[] calldata setTo) public {
        _setRoles(BURN_ASSET_ROLE, burner, setTo);
    }
    
    //
    function SetDebtSystemRole(address[] calldata _address, bool[] calldata _setTo) public {
        _setRoles(DEBT_SYSTEM, _address, _setTo);
    }
}
