pragma solidity >=0.4.24;

contract LnLogger {
    
    function Log0( bytes calldata callData ) internal {
        uint size = callData.length;
        bytes memory _callData = callData;
        assembly {
            log0(add(_callData, 32), size)
        }
    }


    function Log1( bytes calldata callData, bytes32 topic1 ) internal {
        uint size = callData.length;
        bytes memory _callData = callData;
        assembly {
            log1(add(_callData, 32), size, topic1 )
        }
    }

    function Log2( bytes calldata callData, bytes32 topic1, bytes32 topic2 ) internal {
        uint size = callData.length;
        bytes memory _callData = callData;
        assembly {
            log2(add(_callData, 32), size, topic1, topic2 )
        }
    }

    function Log3( bytes calldata callData, bytes32 topic1, bytes32 topic2, bytes32 topic3 ) internal {
        uint size = callData.length;
        bytes memory _callData = callData;
        assembly {
            log3(add(_callData, 32), size, topic1, topic2, topic3 )
        }
    }

    function Log4( bytes calldata callData, bytes32 topic1, bytes32 topic2, bytes32 topic3, bytes32 topic4 ) internal {
        uint size = callData.length;
        bytes memory _callData = callData;
        assembly {
            log4(add(_callData, 32), size, topic1, topic2, topic3, topic4 )
        }
    }
}
