// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "../interfaces/IWormhole.sol";

contract MockWormhole is IWormhole {
    struct VmValues {
        uint16 emitterChainId;
        bytes32 emitterAddress;
        bytes payload;
    }

    uint64 public nextSequence;
    bytes public lastPayload;

    VmValues public vmToReturn;
    bool public shouldFailVerification;

    function parseAndVerifyVM(bytes calldata encodedVM)
        external
        view
        override
        returns (
            VM memory vm,
            bool valid,
            string memory reason
        )
    {
        return (
            IWormhole.VM({
                version: 0,
                timestamp: 0,
                nonce: 0,
                emitterChainId: vmToReturn.emitterChainId,
                emitterAddress: vmToReturn.emitterAddress,
                sequence: 0,
                consistencyLevel: 0,
                payload: vmToReturn.payload,
                guardianSetIndex: 0,
                signatures: new IWormhole.Signature[](0),
                hash: bytes32(0)
            }),
            !shouldFailVerification,
            ""
        );
    }

    function publishMessage(
        uint32 nonce,
        bytes memory payload,
        uint8 consistencyLevel
    ) external payable override returns (uint64 sequence) {
        nextSequence += 1;
        lastPayload = payload;

        return (nextSequence - 1);
    }

    function setVmToReturn(
        uint16 emitterChainId,
        bytes32 emitterAddress,
        bytes calldata payload
    ) external {
        vmToReturn = VmValues({emitterChainId: emitterChainId, emitterAddress: emitterAddress, payload: payload});
    }

    function setShouldFailVerification(bool newValue) external {
        shouldFailVerification = newValue;
    }
}
