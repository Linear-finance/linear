// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "./interfaces/IBandProtocolOracle.sol";
import "./interfaces/IChainlinkOracle.sol";
import "./interfaces/ILnPrices.sol";
import "./upgradeable/LnAdminUpgradeable.sol";
import "./SafeDecimalMath.sol";

/**
 * @title LnOracleRouter
 *
 * @dev A contract for providing Linear contracts with access to asset prices from multiple data
 * oracles including Chainlink and Band Protocol.
 */
contract LnOracleRouter is LnAdminUpgradeable, ILnPrices {
    using SafeCastUpgradeable for int256;
    using SafeDecimalMath for uint256;
    using SafeMathUpgradeable for uint256;

    event GlobalStalePeriodUpdated(uint256 oldStalePeriod, uint256 newStalePeriod);
    event StalePeriodOverrideUpdated(bytes32 currencyKey, uint256 oldStalePeriod, uint256 newStalePeriod);
    event ChainlinkOracleAdded(bytes32 currencyKey, address oracle);
    event BandOracleAdded(bytes32 currencyKey, string bandCurrencyKey, address oracle);
    event OracleRemoved(bytes32 currencyKey, address oracle);

    struct OracleSettings {
        uint8 oracleType;
        address oracleAddress;
    }

    uint256 public globalStalePeriod;
    mapping(bytes32 => uint256) public stalePeriodOverrides;
    mapping(bytes32 => OracleSettings) public oracleSettings;
    mapping(bytes32 => string) public linearCurrencyKeysToBandCurrencyKeys;

    bytes32 public constant override LUSD = "lUSD";

    uint8 public constant ORACLE_TYPE_CHAINLINK = 1;
    uint8 public constant ORACLE_TYPE_BAND = 2;

    uint8 private constant OUTPUT_PRICE_DECIMALS = 18;

    function getPrice(bytes32 currencyKey) external view override returns (uint256) {
        (uint256 price, ) = _getPriceData(currencyKey);
        return price;
    }

    function getPriceAndUpdatedTime(bytes32 currencyKey) external view returns (uint256 price, uint256 time) {
        (price, time) = _getPriceData(currencyKey);
    }

    function isPriceStaled(bytes32 currencyKey) external view returns (bool) {
        if (currencyKey == LUSD) return false;
        (, uint256 time) = _getPriceData(currencyKey);
        return _isUpdateTimeStaled(time, getStalePeriodForCurrency(currencyKey));
    }

    function exchange(
        bytes32 sourceKey,
        uint sourceAmount,
        bytes32 destKey
    ) external view override returns (uint256) {
        if (sourceKey == destKey) return sourceAmount;

        (uint256 sourcePrice, uint256 sourceTime) = _getPriceData(sourceKey);
        (uint256 destPrice, uint256 destTime) = _getPriceData(destKey);

        require(
            !_isUpdateTimeStaled(sourceTime, getStalePeriodForCurrency(sourceKey)) &&
                !_isUpdateTimeStaled(destTime, getStalePeriodForCurrency(destKey)),
            "LnOracleRouter: staled price data"
        );

        return sourceAmount.multiplyDecimalRound(sourcePrice).divideDecimalRound(destPrice);
    }

    function getStalePeriodForCurrency(bytes32 currencyKey) public view returns (uint256) {
        uint256 overridenPeriod = stalePeriodOverrides[currencyKey];
        return overridenPeriod == 0 ? globalStalePeriod : overridenPeriod;
    }

    function __LnOracleRouter_init(address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);
    }

    function setGlobalStalePeriod(uint256 newStalePeriod) external onlyAdmin {
        uint256 oldStalePeriod = globalStalePeriod;
        globalStalePeriod = newStalePeriod;
        emit GlobalStalePeriodUpdated(oldStalePeriod, newStalePeriod);
    }

    function setStalePeriodOverride(bytes32 currencyKey, uint256 newStalePeriod) external onlyAdmin {
        uint256 oldStalePeriod = stalePeriodOverrides[currencyKey];
        stalePeriodOverrides[currencyKey] = newStalePeriod;
        emit StalePeriodOverrideUpdated(currencyKey, oldStalePeriod, newStalePeriod);
    }

    function addChainlinkOracle(
        bytes32 currencyKey,
        address oracleAddress,
        bool removeExisting
    ) external onlyAdmin {
        _addChainlinkOracle(currencyKey, oracleAddress, removeExisting);
    }

    function addChainlinkOracles(
        bytes32[] calldata currencyKeys,
        address[] calldata oracleAddresses,
        bool removeExisting
    ) external onlyAdmin {
        require(currencyKeys.length == oracleAddresses.length, "LnOracleRouter: array length mismatch");

        for (uint256 ind = 0; ind < currencyKeys.length; ind++) {
            _addChainlinkOracle(currencyKeys[ind], oracleAddresses[ind], removeExisting);
        }
    }

    function addBandOracle(
        bytes32 currencyKey,
        string calldata bandCurrencyKey,
        address oracleAddress,
        bool removeExisting
    ) external onlyAdmin {
        _addBandOracle(currencyKey, bandCurrencyKey, oracleAddress, removeExisting);
    }

    function addBandOracles(
        bytes32[] calldata currencyKeys,
        string[] calldata bandCurrencyKeys,
        address[] calldata oracleAddresses,
        bool removeExisting
    ) external onlyAdmin {
        require(
            currencyKeys.length == bandCurrencyKeys.length && bandCurrencyKeys.length == oracleAddresses.length,
            "LnOracleRouter: array length mismatch"
        );

        for (uint256 ind = 0; ind < currencyKeys.length; ind++) {
            _addBandOracle(currencyKeys[ind], bandCurrencyKeys[ind], oracleAddresses[ind], removeExisting);
        }
    }

    function removeOracle(bytes32 currencyKey) external onlyAdmin {
        _removeOracle(currencyKey);
    }

    function _addChainlinkOracle(
        bytes32 currencyKey,
        address oracleAddress,
        bool removeExisting
    ) private {
        require(currencyKey != bytes32(0), "LnOracleRouter: empty currency key");
        require(oracleAddress != address(0), "LnOracleRouter: empty oracle address");

        if (oracleSettings[currencyKey].oracleAddress != address(0)) {
            require(removeExisting, "LnOracleRouter: oracle already exists");
            _removeOracle(currencyKey);
        }

        oracleSettings[currencyKey] = OracleSettings({oracleType: ORACLE_TYPE_CHAINLINK, oracleAddress: oracleAddress});

        emit ChainlinkOracleAdded(currencyKey, oracleAddress);
    }

    function _addBandOracle(
        bytes32 currencyKey,
        string calldata bandCurrencyKey,
        address oracleAddress,
        bool removeExisting
    ) private {
        require(currencyKey != bytes32(0), "LnOracleRouter: empty currency key");
        require(bytes(bandCurrencyKey).length != 0, "LnOracleRouter: empty band currency key");
        require(oracleAddress != address(0), "LnOracleRouter: empty oracle address");

        if (oracleSettings[currencyKey].oracleAddress != address(0)) {
            require(removeExisting, "LnOracleRouter: oracle already exists");
            _removeOracle(currencyKey);
        }

        oracleSettings[currencyKey] = OracleSettings({oracleType: ORACLE_TYPE_BAND, oracleAddress: oracleAddress});
        linearCurrencyKeysToBandCurrencyKeys[currencyKey] = bandCurrencyKey;

        emit BandOracleAdded(currencyKey, bandCurrencyKey, oracleAddress);
    }

    function _removeOracle(bytes32 currencyKey) private {
        OracleSettings memory settings = oracleSettings[currencyKey];
        require(settings.oracleAddress != address(0), "LnOracleRouter: oracle not found");

        delete oracleSettings[currencyKey];

        if (settings.oracleType == ORACLE_TYPE_BAND) {
            delete linearCurrencyKeysToBandCurrencyKeys[currencyKey];
        }

        emit OracleRemoved(currencyKey, settings.oracleAddress);
    }

    function _getPriceData(bytes32 currencyKey) private view returns (uint256 price, uint256 updateTime) {
        if (currencyKey == LUSD) return (SafeDecimalMath.unit(), block.timestamp);

        OracleSettings memory settings = oracleSettings[currencyKey];
        require(settings.oracleAddress != address(0), "LnOracleRouter: oracle not set");

        if (settings.oracleType == ORACLE_TYPE_CHAINLINK) {
            (, int256 rawAnswer, , uint256 rawUpdateTime, ) = IChainlinkOracle(settings.oracleAddress).latestRoundData();

            uint8 oraclePriceDecimals = IChainlinkOracle(settings.oracleAddress).decimals();
            if (oraclePriceDecimals == OUTPUT_PRICE_DECIMALS) {
                price = rawAnswer.toUint256();
            } else if (oraclePriceDecimals > OUTPUT_PRICE_DECIMALS) {
                // Too many decimals
                price = rawAnswer.toUint256().div(10**uint256(oraclePriceDecimals - OUTPUT_PRICE_DECIMALS));
            } else {
                // Too few decimals
                price = rawAnswer.toUint256().mul(10**uint256(OUTPUT_PRICE_DECIMALS - oraclePriceDecimals));
            }

            updateTime = rawUpdateTime;
        } else if (settings.oracleType == ORACLE_TYPE_BAND) {
            IBandProtocolOracle.ReferenceData memory priceRes =
                IBandProtocolOracle(settings.oracleAddress).getReferenceData(
                    linearCurrencyKeysToBandCurrencyKeys[currencyKey],
                    "USD"
                );

            price = priceRes.rate;
            updateTime = priceRes.lastUpdatedBase;
        } else {
            require(false, "LnOracleRouter: unknown oracle type");
        }
    }

    function _isUpdateTimeStaled(uint256 updateTime, uint256 stalePeriod) private view returns (bool) {
        return updateTime.add(stalePeriod) < block.timestamp;
    }
}
