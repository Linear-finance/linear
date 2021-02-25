// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "./interfaces/ILnAccessControl.sol";
import "./LnAddressCache.sol";
import "./upgradeable/LnAdminUpgradeable.sol";

/**
 * @title LnAssetUpgradeable
 *
 * @dev This is an upgradeable version of `LnAsset`.
 */
contract LnAssetUpgradeable is ERC20Upgradeable, LnAdminUpgradeable, LnAddressCache {
    bytes32 mKeyName;
    ILnAccessControl accessCtrl;

    bytes32 private constant ROLE_ISSUE_ASSET = "ISSUE_ASSET";
    bytes32 private constant ROLE_BURN_ASSET = "BURN_ASSET";
    bytes32 private constant ROLE_MOVE_ASSET = "MOVE_ASSET";

    modifier onlyIssueAssetRole() {
        require(accessCtrl.hasRole(ROLE_ISSUE_ASSET, msg.sender), "LnAssetUpgradeable: not ISSUE_ASSET role");
        _;
    }

    modifier onlyBurnAssetRole() {
        require(accessCtrl.hasRole(ROLE_BURN_ASSET, msg.sender), "LnAssetUpgradeable: not BURN_ASSET role");
        _;
    }

    modifier onlyMoveAssetRole() {
        require(accessCtrl.hasRole(ROLE_MOVE_ASSET, msg.sender), "LnAssetUpgradeable: not MOVE_ASSET role");
        _;
    }

    function __LnAssetUpgradeable_init(
        bytes32 _key,
        string memory _name,
        string memory _symbol,
        address _admin
    ) public initializer {
        __ERC20_init(_name, _symbol);
        __LnAdminUpgradeable_init(_admin);

        mKeyName = _key;
    }

    function keyName() external view returns (bytes32) {
        return mKeyName;
    }

    function updateAddressCache(ILnAddressStorage _addressStorage) public override onlyAdmin {
        accessCtrl = ILnAccessControl(
            _addressStorage.getAddressWithRequire("LnAccessControl", "LnAccessControl address not valid")
        );

        emit CachedAddressUpdated("LnAccessControl", address(accessCtrl));
    }

    function mint(address account, uint256 amount) external onlyIssueAssetRole {
        _mint(account, amount);
    }

    function burn(address account, uint256 amount) external onlyBurnAssetRole {
        _burn(account, amount);
    }

    function move(
        address from,
        address to,
        uint256 amount
    ) external onlyMoveAssetRole {
        _transfer(from, to, amount);
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[48] private __gap;
}
