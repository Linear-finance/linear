
pragma solidity ^0.5.16;

import "./LnDefaultPrices.sol";

// chain link Oracle interface
interface OracleInterface {
    function latestAnswer() external view returns (int256);

    function latestTimestamp() external view returns (uint256);

    function latestRound() external view returns (uint256);

    function getAnswer(uint256 roundId) external view returns (int256);

    function getTimestamp(uint256 roundId) external view returns (uint256);
}





contract LnChainLinkPrices is LnDefaultPrices {
    mapping(bytes32 => OracleInterface) public mOracles;

    bytes32[] public mOracleArray;

    constructor( address _admin, address _oracle, bytes32[] memory _currencies, uint[] memory _prices ) public LnDefaultPrices( _admin, _oracle, _currencies,  _prices ) {
    }

    function addOracle(bytes32 currencyKey, address OracleAddress) external onlyAdmin {
        OracleInterface Oracle = OracleInterface(OracleAddress);
        require(Oracle.latestTimestamp() >= 0, "time stamp error");
        if (address(mOracles[currencyKey]) == address(0)) {
            mOracleArray.push(currencyKey);
        }
        mOracles[currencyKey] = Oracle;
        emit OracleAdded(currencyKey, address(Oracle));
    }

    function removeOracle(bytes32 currencyKey) external onlyAdmin {
        address Oracle = address(mOracles[currencyKey]);
        require(Oracle != address(0), "Oracle is not exists");
        delete mOracles[currencyKey];

        bool wasRemoved = removeFromArray(currencyKey, mOracleArray);

        if (wasRemoved) {
            emit OracleRemoved(currencyKey, Oracle);
        }
    }

    function _getPriceData(bytes32 currencyName) internal view returns (PriceData memory) {
        if (address(mOracles[currencyName]) != address(0)) {
            OracleInterface Oracle = mOracles[currencyName];
            PriceData memory priceAndTime;
            priceAndTime.mPrice = uint216(Oracle.latestAnswer() * 1e10);
            priceAndTime.mTime = uint40(Oracle.latestTimestamp());
            return priceAndTime;
        } else {
            return super._getPriceData( currencyName );
        }
    }  

    function removeFromArray(bytes32 entry, bytes32[] storage array) internal returns (bool) {
        for (uint i = 0; i < array.length; i++) {
            if (array[i] == entry) {
                delete array[i];
                array[i] = array[array.length - 1];
                array.length--;
                return true;
            }
        }
        return false;
    }


    event OracleAdded(bytes32 currencyKey, address Oracle);
    event OracleRemoved(bytes32 currencyKey, address Oracle);
}


// test Oracle, for test stub
contract TestOracle is OracleInterface {
    uint public roundId = 0;

    struct Entry {
        int256 answer;
        uint256 timestamp;
    }

    mapping(uint => Entry) public entries;

    constructor() public {}

    function setLatestAnswer(int256 answer, uint256 timestamp) external {
        roundId++;
        entries[roundId] = Entry({answer: answer, timestamp: timestamp});
    }

    function latestAnswer() external view returns (int256) {
        return getAnswer(latestRound());
    }

    function latestTimestamp() external view returns (uint256) {
        return getTimestamp(latestRound());
    }

    function latestRound() public view returns (uint256) {
        return roundId;
    }

    function getAnswer(uint256 _roundId) public view returns (int256) {
        return entries[_roundId].answer;
    }

    function getTimestamp(uint256 _roundId) public view returns (uint256) {
        return entries[_roundId].timestamp;
    }
}