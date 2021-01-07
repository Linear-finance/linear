// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "./interfaces/IMintBurnToken.sol";
import "./upgradeable/LnAdminUpgradeable.sol";

/**
 * @title LnErc20Bridge
 *
 * @dev An upgradeable contract for moving ERC20 tokens across blockchains. An
 * off-chain relayer is responsible for notifying destination chains of the
 * transactions. The relayer can be set to a multi-signature secured account for
 * enhanced security and decentralization.
 *
 * @dev The relayer should wait for finality on the source chain before relaying the transaction
 * to the destination. Otherwise a double-spending attack is possible.
 *
 * @dev The bridge can operate in two different modes for each token: transfer mode and mint/burn
 * mode.
 *
 * @dev Note that transaction hashes shall NOT be used for re-entrance prevention as doing
 * so will result in false negatives when multiple transfers are made in a single
 * transaction (with the use of contracts).
 *
 * @dev Chain IDs in this contract currently refer to the ones introduced in EIP-155. However,
 * a list of custom IDs might be used instead when non-EVM compatible chains are added.
 */
contract LnErc20Bridge is LnAdminUpgradeable {
    /**
     * @dev Emits when a deposit is made.
     *
     * @dev Addresses are represented with bytes32 to maximize compatibility with
     * non-Ethereum-compatible blockchains.
     *
     * @param srcChainId Chain ID of the source blockchain (current chain)
     * @param destChainId Chain ID of the destination blockchain
     * @param depositId Unique ID of the deposit on the current chain
     * @param depositor Address of the account on the current chain that made the deposit
     * @param withdrawer Address of the account on the destination chain that's allowed to withdraw
     * @param currency A bytes32-encoded universal currency key
     * @param amount Amount of tokens being deposited
     * @param forcedWithdrawalAllowed Whether the depositor allowed the amount to be forcibly pushed
     * to withdrawer's address.
     */
    event TokenDeposited(
        uint256 srcChainId,
        uint256 destChainId,
        uint256 depositId,
        bytes32 depositor,
        bytes32 withdrawer,
        bytes32 currency,
        uint256 amount,
        bool forcedWithdrawalAllowed
    );
    event DepositRelayed(
        uint256 srcChainId,
        uint256 destChainId,
        uint256 depositId,
        bytes32 depositor,
        bytes32 withdrawer,
        bytes32 currency,
        uint256 amount,
        bool forcedWithdrawalAllowed
    );
    event TokenWithdrawn(
        uint256 srcChainId,
        uint256 destChainId,
        uint256 depositId,
        bytes32 withdrawer,
        bytes32 recipient,
        bytes32 currency,
        uint256 amount
    );
    event RelayerChanged(address oldRelayer, address newRelayer);
    event TokenAdded(bytes32 tokenKey, address tokenAddress, uint8 lockType);
    event TokenRemoved(bytes32 tokenKey);
    event ChainSupportForTokenAdded(bytes32 tokenKey, uint256 chainId);
    event ChainSupportForTokenDropped(bytes32 tokenKey, uint256 chainId);

    struct TokenInfo {
        address tokenAddress;
        uint8 lockType;
    }

    struct RelayedDeposit {
        bytes32 withdrawer;
        bytes32 currency;
        uint256 amount;
        bool forcedWithdrawalAllowed;
        bool withdrawn;
    }

    uint256 public currentChainId;
    address public relayer;
    uint256 public depositCount;
    mapping(bytes32 => TokenInfo) public tokenInfos;
    mapping(bytes32 => mapping(uint256 => bool)) tokenSupportedOnChain;
    mapping(uint256 => mapping(uint256 => RelayedDeposit)) relayedDeposits;

    uint8 public constant TOKEN_LOCK_TYPE_TRANSFER = 1;
    uint8 public constant TOKEN_LOCK_TYPE_MINT_BURN = 2;

    bytes4 private constant TRANSFER_SELECTOR = bytes4(keccak256(bytes("transfer(address,uint256)")));
    bytes4 private constant TRANSFERFROM_SELECTOR = bytes4(keccak256(bytes("transferFrom(address,address,uint256)")));

    modifier onlyRelayer {
        require((msg.sender == relayer), "LnErc20Bridge: not relayer");
        _;
    }

    function getTokenAddress(bytes32 tokenKey) public view returns (address) {
        return tokenInfos[tokenKey].tokenAddress;
    }

    function getTokenLockType(bytes32 tokenKey) public view returns (uint8) {
        return tokenInfos[tokenKey].lockType;
    }

    function isTokenSupportedOnChain(bytes32 tokenKey, uint256 chainId) public view returns (bool) {
        return tokenSupportedOnChain[tokenKey][chainId];
    }

    function __LnErc20Bridge_init(address _relayer, address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);

        _setRelayer(_relayer);

        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        currentChainId = chainId;
    }

    function setRelayer(address _relayer) external onlyAdmin {
        _setRelayer(_relayer);
    }

    function addToken(
        bytes32 tokenKey,
        address tokenAddress,
        uint8 lockType
    ) external onlyAdmin {
        require(tokenInfos[tokenKey].tokenAddress == address(0), "LnErc20Bridge: token already exists");
        require(tokenAddress != address(0), "LnErc20Bridge: zero address");
        require(
            lockType == TOKEN_LOCK_TYPE_TRANSFER || lockType == TOKEN_LOCK_TYPE_MINT_BURN,
            "LnErc20Bridge: unknown token lock type"
        );

        tokenInfos[tokenKey] = TokenInfo({tokenAddress: tokenAddress, lockType: lockType});
        emit TokenAdded(tokenKey, tokenAddress, lockType);
    }

    function removeToken(bytes32 tokenKey) external onlyAdmin {
        require(tokenInfos[tokenKey].tokenAddress != address(0), "LnErc20Bridge: token does not exists");
        delete tokenInfos[tokenKey];
        emit TokenRemoved(tokenKey);
    }

    function addChainSupportForToken(bytes32 tokenKey, uint256 chainId) external onlyAdmin {
        require(!tokenSupportedOnChain[tokenKey][chainId], "LnErc20Bridge: already supported");
        tokenSupportedOnChain[tokenKey][chainId] = true;
        emit ChainSupportForTokenAdded(tokenKey, chainId);
    }

    function dropChainSupportForToken(bytes32 tokenKey, uint256 chainId) external onlyAdmin {
        require(tokenSupportedOnChain[tokenKey][chainId], "LnErc20Bridge: not supported");
        tokenSupportedOnChain[tokenKey][chainId] = false;
        emit ChainSupportForTokenDropped(tokenKey, chainId);
    }

    function relay(
        uint256 srcChainId,
        uint256 destChainId,
        uint256 depositId,
        bytes32 depositor,
        bytes32 withdrawer,
        bytes32 currency,
        uint256 amount,
        bool forcedWithdrawalAllowed
    ) external onlyRelayer {
        require(destChainId == currentChainId, "LnErc20Bridge: wrong chain");
        require(relayedDeposits[srcChainId][depositId].withdrawer == 0, "LnErc20Bridge: deposit already exists");

        relayedDeposits[srcChainId][depositId] = RelayedDeposit({
            withdrawer: withdrawer,
            currency: currency,
            amount: amount,
            forcedWithdrawalAllowed: forcedWithdrawalAllowed,
            withdrawn: false
        });

        emit DepositRelayed(
            srcChainId,
            destChainId,
            depositId,
            depositor,
            withdrawer,
            currency,
            amount,
            forcedWithdrawalAllowed
        );
    }

    function deposit(
        bytes32 token,
        uint256 amount,
        uint256 destChainId,
        bytes32 withdrawer,
        bool allowForcedWithdrawal
    ) external {
        require(amount > 0, "LnErc20Bridge: amount must be positive");
        require(destChainId != currentChainId, "LnErc20Bridge: dest must be different from src");
        require(isTokenSupportedOnChain(token, destChainId), "LnErc20Bridge: token not supported on chain");
        require(withdrawer != 0, "LnErc20Bridge: zero address");

        TokenInfo memory tokenInfo = tokenInfos[token];
        require(tokenInfo.tokenAddress != address(0), "LnErc20Bridge: token not found");

        depositCount = depositCount + 1;

        if (tokenInfo.lockType == TOKEN_LOCK_TYPE_TRANSFER) {
            safeTransferFrom(tokenInfo.tokenAddress, msg.sender, address(this), amount);
        } else if (tokenInfo.lockType == TOKEN_LOCK_TYPE_MINT_BURN) {
            IMintBurnToken(tokenInfo.tokenAddress).burn(msg.sender, amount);
        } else {
            require(false, "LnErc20Bridge: unknown token lock type");
        }

        emit TokenDeposited(
            currentChainId,
            destChainId,
            depositCount,
            bytes32(uint256(msg.sender)),
            withdrawer,
            token,
            amount,
            allowForcedWithdrawal
        );
    }

    function withdraw(uint256 srcChainId, uint256 depositId) external {
        _withdraw(srcChainId, depositId, msg.sender, true);
    }

    function withdraw(
        uint256 srcChainId,
        uint256 depositId,
        address recipient
    ) external {
        _withdraw(srcChainId, depositId, recipient, true);
    }

    function withdrawFor(uint256 srcChainId, uint256 depositId) external {
        _withdraw(srcChainId, depositId, address(0), false);
    }

    function _setRelayer(address _relayer) private {
        require(_relayer != address(0), "LnErc20Bridge: zero address");
        require(_relayer != relayer, "LnErc20Bridge: relayer not changed");

        address oldRelayer = relayer;
        relayer = _relayer;

        emit RelayerChanged(oldRelayer, relayer);
    }

    function _withdraw(
        uint256 srcChainId,
        uint256 depositId,
        address recipient, // discarded when not withdrawing for self
        bool isWithdrawingForSelf
    ) private {
        RelayedDeposit memory pendingDeposit = relayedDeposits[srcChainId][depositId];
        require(pendingDeposit.withdrawer != 0, "LnErc20Bridge: deposit not found");
        require(!pendingDeposit.withdrawn, "LnErc20Bridge: already withdrawn");
        require(pendingDeposit.amount > 0, "LnErc20Bridge: zero amount");

        if (isWithdrawingForSelf) {
            require(pendingDeposit.withdrawer == bytes32(uint256(msg.sender)), "LnErc20Bridge: not withdrawer");
        } else {
            require(pendingDeposit.forcedWithdrawalAllowed, "LnErc20Bridge: forced withdrawal not allowed");
        }

        TokenInfo memory tokenInfo = tokenInfos[pendingDeposit.currency];
        require(tokenInfo.tokenAddress != address(0), "LnErc20Bridge: token not found");

        // pendingDeposit.withdrawn won't work as it's just a copy in memory
        relayedDeposits[srcChainId][depositId].withdrawn = true;

        address actualRecipient = isWithdrawingForSelf ? recipient : address(uint160(uint256(pendingDeposit.withdrawer)));

        if (tokenInfo.lockType == TOKEN_LOCK_TYPE_TRANSFER) {
            safeTransfer(tokenInfo.tokenAddress, actualRecipient, pendingDeposit.amount);
        } else if (tokenInfo.lockType == TOKEN_LOCK_TYPE_MINT_BURN) {
            IMintBurnToken(tokenInfo.tokenAddress).mint(actualRecipient, pendingDeposit.amount);
        } else {
            require(false, "LnErc20Bridge: unknown token lock type");
        }

        emit TokenWithdrawn(
            srcChainId,
            currentChainId,
            depositId,
            bytes32(uint256(msg.sender)),
            bytes32(uint256(actualRecipient)),
            pendingDeposit.currency,
            pendingDeposit.amount
        );
    }

    function safeTransfer(
        address token,
        address recipient,
        uint256 amount
    ) private {
        (bool success, bytes memory data) = token.call(abi.encodeWithSelector(TRANSFER_SELECTOR, recipient, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "HbtcStakingPool: transfer failed");
    }

    function safeTransferFrom(
        address token,
        address sender,
        address recipient,
        uint256 amount
    ) private {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(TRANSFERFROM_SELECTOR, sender, recipient, amount));
        require(success && (data.length == 0 || abi.decode(data, (bool))), "HbtcStakingPool: transfer from failed");
    }
}
