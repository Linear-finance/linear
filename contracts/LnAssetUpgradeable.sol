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

    modifier onlyIssueAssetRole(address _address) {
        require(accessCtrl.hasRole(accessCtrl.ISSUE_ASSET_ROLE(), _address), "Need issue access role");
        _;
    }
    modifier onlyBurnAssetRole(address _address) {
        require(accessCtrl.hasRole(accessCtrl.BURN_ASSET_ROLE(), _address), "Need burn access role");
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

    function mint(address account, uint256 amount) external onlyIssueAssetRole(msg.sender) {
        _mint(account, amount);
    }

    function burn(address account, uint amount) external onlyBurnAssetRole(msg.sender) {
        _burn(account, amount);
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[48] private __gap;
}
