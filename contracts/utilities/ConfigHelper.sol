// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.9.0;

/**
 * @title ConfigHelper
 *
 * @dev A helper library for calculating collateral-specific config keys.
 */
library ConfigHelper {
    bytes32 private constant NATIVE_CURRENCY = "LINA";

    function getBuildRatioKey(bytes32 currency) internal pure returns (bytes32) {
        return handleKey(bytes32("BuildRatio"), bytes32("BuildRatio"), currency);
    }

    function getLiquidationRatioKey(bytes32 currency) internal pure returns (bytes32) {
        return handleKey(bytes32("LiquidationRatio"), bytes32("LiqRatio"), currency);
    }

    function getLiquidationDelayKey(bytes32 currency) internal pure returns (bytes32) {
        return handleKey(bytes32("LiquidationDelay"), bytes32("LiqDelay"), currency);
    }

    function getLiquidationMarkerRewardKey(bytes32 currency) internal pure returns (bytes32) {
        return handleKey(bytes32("LiquidationMarkerReward"), bytes32("LiqMarkerReward"), currency);
    }

    function getLiquidationLiquidatorRewardKey(bytes32 currency) internal pure returns (bytes32) {
        return handleKey(bytes32("LiquidationLiquidatorReward"), bytes32("LiqLiquidatorReward"), currency);
    }

    function getLiquidationMarkRemoveRatioKey(bytes32 currency) internal pure returns (bytes32) {
        return handleKey(bytes32("LiquidationMarkRemoveRatio"), bytes32("LiqMarkRemoveRatio"), currency);
    }

    function handleKey(
        bytes32 fallbackKey,
        bytes32 offsetKey,
        bytes32 currency
    ) internal pure returns (bytes32) {
        // Backward compatibility
        if (currency == NATIVE_CURRENCY) {
            return fallbackKey;
        }

        return prefixWithCurrency(offsetKey, currency);
    }

    function prefixWithCurrency(bytes32 rawKey, bytes32 currency) private pure returns (bytes32) {
        uint8 currencyLength = contentLength(currency);
        bytes32 mixedKey = currency | ((rawKey >> ((currencyLength + 1) * 8)) | (bytes32("_") >> (currencyLength * 8)));

        return (mixedKey);
    }

    function contentLength(bytes32 value) private pure returns (uint8) {
        for (uint8 ind = 0; ind <= 31; ind++) {
            if (value[ind] == 0) {
                return ind;
            }
        }
        return 32;
    }
}
