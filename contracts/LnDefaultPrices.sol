// SPDX-License-Identifier: MIT
pragma solidity ^0.6.0;

import "./upgradeable/LnAdminUpgradeable.sol";
import "./LnBasePrices.sol";
import "./SafeDecimalMath.sol";

contract LnDefaultPrices is LnAdminUpgradeable, LnBasePrices {
    using SafeMath for uint;
    using SafeDecimalMath for uint;

    address public oracle;

    uint public override stalePeriod;

    mapping(bytes32 => uint) public mPricesLastRound;

    struct PriceData {
        uint216 mPrice;
        uint40 mTime;
    }

    mapping(bytes32 => mapping(uint => PriceData)) private mPricesStorage;

    uint private constant ORACLE_TIME_LIMIT = 10 minutes;

    function __LnDefaultPrices_init(
        address _admin,
        address _oracle,
        bytes32[] memory _currencyNames,
        uint[] memory _newPrices
    ) public initializer {
        __LnAdminUpgradeable_init(_admin);

        stalePeriod = 12 hours;

        require(_currencyNames.length == _newPrices.length, "array length error.");

        oracle = _oracle;

        // The LUSD price is always 1 and is never stale.
        _setPrice(LUSD, SafeDecimalMath.unit(), now);

        _updateAll(_currencyNames, _newPrices, now);
    }

    /* interface */
    function getPrice(bytes32 currencyName) external view override returns (uint) {
        return _getPrice(currencyName);
    }

    function getPriceAndUpdatedTime(bytes32 currencyName) external view override returns (uint price, uint time) {
        PriceData memory priceAndTime = _getPriceData(currencyName);
        return (priceAndTime.mPrice, priceAndTime.mTime);
    }

    function exchange( bytes32 sourceName, uint sourceAmount, bytes32 destName ) external view override returns (uint value) {
        (value, , ) = _exchangeAndPrices(sourceName, sourceAmount, destName);
    }

    function exchangeAndPrices( bytes32 sourceName, uint sourceAmount, bytes32 destName ) external view override
        returns (uint value, uint sourcePrice, uint destPrice )
    {
        return _exchangeAndPrices(sourceName, sourceAmount, destName);
    }

    function isStale(bytes32 currencyName) external view override returns (bool) {
        if (currencyName == LUSD ) return false;
        return _getUpdatedTime(currencyName).add(stalePeriod) < now;
    }


    /* functions */
    function getCurrentRoundId(bytes32 currencyName) external view returns (uint) {
        return mPricesLastRound[currencyName];
    }


    function setOracle(address _oracle) external onlyAdmin {
        oracle = _oracle;
        emit OracleUpdated(oracle);
    }

    function setStalePeriod(uint _time) external onlyAdmin {
        stalePeriod = _time;
        emit StalePeriodUpdated(stalePeriod);
    }

    // 外部调用，更新汇率 oracle是一个地址，从外部用脚本定期调用这个接口
    function updateAll( bytes32[] calldata currencyNames, uint[] calldata newPrices, uint timeSent ) external onlyOracle returns (bool) {
        _updateAll(currencyNames, newPrices, timeSent);
    }

    
    function deletePrice(bytes32 currencyName) external onlyOracle {
        require( _getPrice(currencyName) > 0, "price is zero");

        delete mPricesStorage[currencyName][mPricesLastRound[currencyName]];

        mPricesLastRound[currencyName]--;

        emit PriceDeleted(currencyName);
    }


    function _setPrice( bytes32 currencyName, uint256 price, uint256 time ) internal {
        // start from 1
        mPricesLastRound[currencyName]++;
        mPricesStorage[currencyName][mPricesLastRound[currencyName]] = 
            PriceData({ mPrice: uint216(price), mTime: uint40(time) });
    }


    function _updateAll( bytes32[] memory currencyNames, uint[] memory newPrices, uint timeSent ) internal returns (bool) {
        require(currencyNames.length == newPrices.length, "array length error, not match.");
        require(timeSent < (now + ORACLE_TIME_LIMIT), "Time error");

        for (uint i = 0; i < currencyNames.length; i++) {
            bytes32 currencyName = currencyNames[i];

            require(newPrices[i] != 0, "Zero is not a valid price, please call deletePrice instead.");
            require(currencyName != LUSD, "LUSD cannot be updated.");

            if (timeSent < _getUpdatedTime(currencyName)) {
                continue;
            }

            _setPrice(currencyName, newPrices[i], timeSent);
        }

        emit PricesUpdated(currencyNames, newPrices);

        return true;
    }


    function _getPriceData(bytes32 currencyName) internal view virtual returns (PriceData memory) {
        return mPricesStorage[currencyName][mPricesLastRound[currencyName]];
    }

     function _getPrice(bytes32 currencyName ) internal view returns (uint256) {
        PriceData memory priceAndTime = _getPriceData(currencyName);
        return priceAndTime.mPrice;
    }

    function _getUpdatedTime(bytes32 currencyName ) internal view returns (uint256) {
        PriceData memory priceAndTime = _getPriceData(currencyName);
        return priceAndTime.mTime;
    }

    function _exchangeAndPrices( bytes32 sourceName, uint sourceAmount, bytes32 destName ) internal view 
        returns ( uint value, uint sourcePrice, uint destPrice )
    {
        sourcePrice = _getPrice(sourceName);
        // If there's no change in the currency, then just return the amount they gave us
        if (sourceName == destName) {
            destPrice = sourcePrice;
            value = sourceAmount;
        } else {
            // Calculate the effective value by going from source -> USD -> destination
            destPrice = _getPrice(destName);
            value = sourceAmount.multiplyDecimalRound(sourcePrice).divideDecimalRound(destPrice);
        }
    }

    /* ========== MODIFIERS ========== */
    modifier onlyOracle {
        require(msg.sender == oracle, "Only the oracle can perform this action");
        _;
    }

    /* ========== EVENTS ========== */
    event OracleUpdated(address newOracle);
    event StalePeriodUpdated(uint priceStalePeriod);
    event PricesUpdated(bytes32[] currencyNames, uint[] newPrices);
    event PriceDeleted(bytes32 currencyName);

    // Reserved storage space to allow for layout changes in the future.
    uint256[46] private __gap;
}
