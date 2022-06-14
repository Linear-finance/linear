// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./upgradeable/LnAdminUpgradeable.sol";

contract LnConfig is LnAdminUpgradeable {
    mapping(bytes32 => uint) internal mUintConfig;

    function __LnConfig_init(address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);
    }

    //some configue keys
    bytes32 public constant BUILD_RATIO = "BuildRatio"; // percent, base 10e18
    bytes32 public constant BUILD_RATIO_BNB = "BuildRatioBnb"; // percent, base 10e18
    bytes32 public constant BUILD_RATIO_BUSD = "BuildRatioBusd"; // percent, base 10e18
    bytes32 public constant BUILD_RATIO_LINA = "BuildRatioLina"; // percent, base 10e18

    function getUint(bytes32 key) external view returns (uint) {
        return mUintConfig[key];
    }

    function setUint(bytes32 key, uint value) external onlyAdmin {
        mUintConfig[key] = value;
        emit SetUintConfig(key, value);
    }

    function deleteUint(bytes32 key) external onlyAdmin {
        delete mUintConfig[key];
        emit SetUintConfig(key, 0);
    }

    function batchSet(bytes32[] calldata names, uint[] calldata values) external onlyAdmin {
        require(names.length == values.length, "Input lengths must match");

        for (uint i = 0; i < names.length; i++) {
            mUintConfig[names[i]] = values[i];
            emit SetUintConfig(names[i], values[i]);
        }
    }

    function getBuildRatioKey(bytes32 currencySymbol) external pure returns (bytes32) {
        require(currencySymbol == "LINA" || currencySymbol == "BUSD" || currencySymbol == "BNB", "LnConfig: currency not accepted");
        if (currencySymbol == "LINA") {
            return BUILD_RATIO_LINA;
        }
        if (currencySymbol == "BUSD") {
            return BUILD_RATIO_BUSD;
        }
        if (currencySymbol == "BNB") {
            return BUILD_RATIO_BNB;
        }
    }

    event SetUintConfig(bytes32 key, uint value);

    // Reserved storage space to allow for layout changes in the future.
    uint256[49] private __gap;
}
