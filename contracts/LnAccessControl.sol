// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

// example:
//LnAccessControl accessCtrl = LnAccessControl(addressStorage.getAddress("LnAccessControl"));
//require(accessCtrl.hasRole(accessCtrl.DEBT_SYSTEM(), _address), "Need debt system access role");

// contract access control
contract LnAccessControl is AccessControlUpgradeable {
    // -------------------------------------------------------
    // role type
    bytes32 public constant ISSUE_ASSET_ROLE = ("ISSUE_ASSET"); //keccak256
    bytes32 public constant BURN_ASSET_ROLE = ("BURN_ASSET");

    bytes32 public constant DEBT_SYSTEM = ("LnDebtSystem");

    // -------------------------------------------------------
    function __LnAccessControl_init(address admin) public initializer {
        _setupRole(DEFAULT_ADMIN_ROLE, admin);
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
    function SetRoles(
        bytes32 roleType,
        address[] calldata addresses,
        bool[] calldata setTo
    ) external {
        require(IsAdmin(msg.sender), "Only admin");

        _setRoles(roleType, addresses, setTo);
    }

    function _setRoles(
        bytes32 roleType,
        address[] calldata addresses,
        bool[] calldata setTo
    ) private {
        require(addresses.length == setTo.length, "parameter address length not eq");

        for (uint256 i = 0; i < addresses.length; i++) {
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

    // Reserved storage space to allow for layout changes in the future.
    uint256[50] private __gap;
}
