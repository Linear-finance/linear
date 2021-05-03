// SPDX-License-Identifier: MIT
pragma solidity >=0.4.24;

import "./interfaces/ILnPrices.sol";

abstract contract LnBasePrices is ILnPrices {
    bytes32 public constant LINA = "LINA";
    bytes32 public constant override LUSD = "lUSD";
}
