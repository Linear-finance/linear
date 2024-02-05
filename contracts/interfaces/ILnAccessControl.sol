// SPDX-License-Identifier: MIT
pragma solidity >=0.6.12 <0.8.0;

interface ILnAccessControl {
    function hasRole(bytes32 role, address account) external view returns (bool);

    function ISSUE_ASSET_ROLE() external view returns (bytes32);

    function BURN_ASSET_ROLE() external view returns (bytes32);

    function DEBT_SYSTEM() external view returns (bytes32);

    function IsAdmin(address _address) external view returns (bool);

    function SetAdmin(address _address) external returns (bool);

    function SetRoles(
        bytes32 roleType,
        address[] calldata addresses,
        bool[] calldata setTo
    ) external;

    function SetIssueAssetRole(address[] calldata issuer, bool[] calldata setTo) external;

    function SetBurnAssetRole(address[] calldata burner, bool[] calldata setTo) external;

    function SetDebtSystemRole(address[] calldata _address, bool[] calldata _setTo) external;
}
