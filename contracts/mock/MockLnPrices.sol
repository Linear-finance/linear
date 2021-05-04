// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "../interfaces/ILnPrices.sol";
import "../SafeDecimalMath.sol";

contract MockLnPrices is ILnPrices {
    using SafeDecimalMath for uint256;

    struct PriceData {
        uint256 price;
        uint256 updateTime;
    }

    uint256 stalePeriod;
    mapping(bytes32 => PriceData) priceData;

    bytes32 public constant override LUSD = "lUSD";

    constructor(uint256 _stalePeriod) public {
        stalePeriod = _stalePeriod;
    }

    function exchange(
        bytes32 sourceKey,
        uint sourceAmount,
        bytes32 destKey
    ) external view override returns (uint) {
        PriceData memory sourceData = _getPriceData(sourceKey);
        PriceData memory destData = _getPriceData(destKey);

        require(
            !_isUpdateTimeStaled(sourceData.updateTime) && !_isUpdateTimeStaled(destData.updateTime),
            "MockLnPrices: staled price data"
        );

        return sourceAmount.multiplyDecimalRound(sourceData.price).divideDecimalRound(destData.price);
    }

    function getPrice(bytes32 currencyKey) public view override returns (uint) {
        return _getPriceData(currencyKey).price;
    }

    function setPrice(bytes32 currencyKey, uint256 price) external {
        priceData[currencyKey] = PriceData({price: price, updateTime: block.timestamp});
    }

    function setPriceAndTime(
        bytes32 currencyKey,
        uint256 price,
        uint256 updateTime
    ) external {
        priceData[currencyKey] = PriceData({price: price, updateTime: updateTime});
    }

    function setStalePeriod(uint256 _stalePeriod) external {
        stalePeriod = _stalePeriod;
    }

    function _getPriceData(bytes32 currencyKey) private view returns (PriceData memory) {
        return
            currencyKey == LUSD
                ? PriceData({price: SafeDecimalMath.unit(), updateTime: block.timestamp})
                : priceData[currencyKey];
    }

    function _isUpdateTimeStaled(uint256 updateTime) private view returns (bool) {
        return updateTime + stalePeriod < block.timestamp;
    }
}
