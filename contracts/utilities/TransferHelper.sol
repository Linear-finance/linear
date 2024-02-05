// SPDX-License-Identifier: MIT
pragma solidity >=0.6.0 <0.8.0;

/**
 * @title TransferHelper
 *
 * @dev A helper library for calling functions on ERC20 tokens with compatibility for
 * non-ERC20 compliant contracts like Tether.
 */
library TransferHelper {
    bytes4 private constant TRANSFER_SELECTOR = bytes4(keccak256(bytes("transfer(address,uint256)")));
    bytes4 private constant APPROVE_SELECTOR = bytes4(keccak256(bytes("approve(address,uint256)")));
    bytes4 private constant TRANSFERFROM_SELECTOR = bytes4(keccak256(bytes("transferFrom(address,address,uint256)")));

    function safeTransfer(
        address token,
        address recipient,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(TRANSFER_SELECTOR, recipient, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: transfer failed");
    }

    function safeApprove(
        address token,
        address spender,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(APPROVE_SELECTOR, spender, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: approve failed");
    }

    function safeTransferFrom(
        address token,
        address sender,
        address recipient,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(TRANSFERFROM_SELECTOR, sender, recipient, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "TransferHelper: transferFrom failed");
    }
}
