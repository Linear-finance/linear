// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;
pragma experimental ABIEncoderV2;

import "./interfaces/IBandProtocolOracle.sol";
import "./LnDefaultPrices.sol";

contract LnBandProtocol is LnDefaultPrices {
    event OracleAdded(bytes32 currencyKey, string bandCurrencyKey, address oracle);
    event OracleRemoved(bytes32 currencyKey, address oracle);

    mapping(bytes32 => IBandProtocolOracle) public bandOracleMap;
    bytes32[] public bandOracleMapKeys;

    mapping(bytes32 => string) public bandCurrencyKeys;

    function __LnBandProtocol_init(
        address _admin,
        address _oracle,
        bytes32[] memory _currencyNames,
        uint[] memory _newPrices
    ) public initializer {
        __LnDefaultPrices_init(_admin, _oracle, _currencyNames, _newPrices);
    }

    function addOracle(
        bytes32 currencyKey,
        string calldata bandCurrencyKey,
        address oracleAddress
    ) external onlyAdmin {
        require(address(bandOracleMap[currencyKey]) == address(0), "LnBandProtocol: oracle already exists");

        bandOracleMap[currencyKey] = IBandProtocolOracle(oracleAddress);
        bandOracleMapKeys.push(currencyKey);

        bandCurrencyKeys[currencyKey] = bandCurrencyKey;

        emit OracleAdded(currencyKey, bandCurrencyKey, oracleAddress);
    }

    function removeOracle(bytes32 currencyKey) external onlyAdmin {
        address oracleAddress = address(bandOracleMap[currencyKey]);
        require(oracleAddress != address(0), "Oracle does not exists");

        delete bandOracleMap[currencyKey];

        removeFromArray(currencyKey, bandOracleMapKeys);
        emit OracleRemoved(currencyKey, oracleAddress);
    }

    function _getPriceData(bytes32 currencyBase) internal view override returns (PriceData memory) {
        string memory currencyQuote = "USD";
        string memory bandCurrencyKey = bandCurrencyKeys[currencyBase];

        IBandProtocolOracle bandOracle = bandOracleMap[currencyBase];

        if (address(bandOracle) != address(0)) {
            IBandProtocolOracle.ReferenceData memory priceRes = bandOracle.getReferenceData(bandCurrencyKey, currencyQuote);
            return PriceData({mPrice: uint216(priceRes.rate), mTime: uint40(priceRes.lastUpdatedBase)});
        } else {
            return super._getPriceData(currencyBase);
        }
    }

    function removeFromArray(bytes32 entry, bytes32[] storage array) private {
        for (uint i = 0; i < array.length; i++) {
            if (array[i] == entry) {
                delete array[i];
                array[i] = array[array.length - 1];
                array.pop();
                return;
            }
        }
    }

    uint256[47] private __gap;
}
