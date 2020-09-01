// SPDX-License-Identifier: MIT
pragma solidity >=0.4.24;


// a facade for prices fetch from oracles
interface LnPrices {

    // get price for a currency
    function getPrice(bytes32 currencyName) external view returns (uint);

    // get price and updated time for a currency
    function getPriceAndUpdatedTime(bytes32 currencyName) external view returns (uint price, uint time);


    // is the price is stale
    function isStale(bytes32 currencyName) external view returns (bool);

    // the defined stale time
    function stalePeriod() external view returns (uint);

    // exchange amount of source currenty for some dest currency, also get source and dest curreny price
    function exchange( bytes32 sourceName, uint sourceAmount, bytes32 destName ) external view returns ( uint );

    // exchange amount of source currenty for some dest currency
    function exchangeAndPrices( bytes32 sourceName, uint sourceAmount, bytes32 destName ) external view
        returns ( uint value, uint sourcePrice, uint destPrice );
}


abstract contract LnBasePrices is LnPrices{
    // const name
    bytes32 public constant LINA = "LINA";
    bytes32 public constant LUSD = "lUsd";

}