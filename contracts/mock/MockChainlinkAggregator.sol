// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "../interfaces/IChainlinkOracle.sol";

contract MockChainlinkAggregator is IChainlinkOracle {
    uint8 public _decimals;

    uint80 public _roundId;
    int256 public _answer;
    uint256 public _startedAt;
    uint256 public _updatedAt;
    uint80 public _answeredInRound;

    function decimals() external view override returns (uint8) {
        return _decimals;
    }

    function latestRoundData()
        external
        view
        override
        returns (
            uint80 roundId,
            int256 answer,
            uint256 startedAt,
            uint256 updatedAt,
            uint80 answeredInRound
        )
    {
        roundId = _roundId;
        answer = _answer;
        startedAt = _startedAt;
        updatedAt = _updatedAt;
        answeredInRound = _answeredInRound;
    }

    function setDecimals(uint8 newDecimals) external {
        _decimals = newDecimals;
    }

    function setLatestRoundData(
        uint80 newRoundId,
        int256 newAnswer,
        uint256 newStartedAt,
        uint256 newUpdatedAt,
        uint80 newAnsweredInRound
    ) external {
        _roundId = newRoundId;
        _answer = newAnswer;
        _startedAt = newStartedAt;
        _updatedAt = newUpdatedAt;
        _answeredInRound = newAnsweredInRound;
    }
}
