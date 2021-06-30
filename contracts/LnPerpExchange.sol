// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "./interfaces/ILnAsset.sol";
import "./interfaces/ILnAssetSystem.sol";
import "./interfaces/ILnConfig.sol";
import "./interfaces/ILnPerpetual.sol";
import "./interfaces/ILnPerpExchange.sol";
import "./interfaces/ILnPerpPositionToken.sol";

contract LnPerpExchange is ILnPerpExchange, OwnableUpgradeable {
    using SafeCastUpgradeable for uint256;
    using SafeMathUpgradeable for uint256;

    event OpenPositionActionQueued(
        uint256 actionId,
        address user,
        bytes32 underlying,
        bool isLong,
        uint256 size,
        uint256 collateral
    );
    event IncreasePositionActionQueued(
        uint256 actionId,
        address user,
        bytes32 underlying,
        uint256 positionId,
        uint256 size,
        uint256 collateral
    );
    event ClosePositionActionQueued(
        uint256 actionId,
        address user,
        bytes32 underlying,
        uint256 positionId,
        uint256 amount,
        address to
    );
    event ActionSettled(uint256 actionId);
    event ActionReverted(uint256 actionId);
    event PoolFeeHolderChanged(address newPoolFeeHolder);
    event FoundationFeeHolderChanged(address newFoundationFeeHolder);
    event FeesCharged(uint256 positionId, uint256 feeForPool, uint256 feeForFoundation);
    event InsuranceFundContribution(uint256 positionId, uint256 amount);

    struct PendingActionMeta {
        uint64 timestamp;
        address user;
        uint8 actionType;
    }
    struct OpenPositionActionData {
        bytes32 underlying;
        bool isLong;
        uint256 size;
        uint256 collateral;
    }
    struct IncreasePositionActionData {
        bytes32 underlying;
        uint256 positionId;
        uint256 size;
        uint256 collateral;
    }
    struct ClosePositionActionData {
        bytes32 underlying;
        uint256 positionId;
        uint256 amount;
        address to;
    }

    ILnAssetSystem public lnAssetSystem;
    ILnConfig public lnConfig;
    ILnPerpPositionToken public positionToken;
    ILnAsset public lusdToken;
    address public override insuranceFundHolder;
    address public poolFeeHolder;
    address public foundationFeeHolder;

    uint256 public lastPendingActionId;
    mapping(uint256 => PendingActionMeta) public pendingActionMetas;
    mapping(uint256 => OpenPositionActionData) public openPositionActions;
    mapping(uint256 => IncreasePositionActionData) public increasePositionActions;
    mapping(uint256 => ClosePositionActionData) public closePositionActions;

    uint8 public constant ACTION_TYPE_OPEN_POSITION = 1;
    uint8 public constant ACTION_TYPE_INCREASE_POSITION = 2;
    uint8 public constant ACTION_TYPE_CLOSE_POSITION = 3;

    uint256 private constant UNIT = 10**18;
    bytes32 private constant CONFIG_TRADE_SETTLEMENT_DELAY = "TradeSettlementDelay";
    bytes32 private constant CONFIG_TRADE_REVERT_DELAY = "TradeRevertDelay";
    bytes32 private constant CONFIG_FEE_SPLIT = "FoundationFeeSplit";

    function __LnPerpExchange_init(
        ILnAssetSystem _lnAssetSystem,
        ILnConfig _lnConfig,
        ILnPerpPositionToken _positionToken,
        ILnAsset _lusdToken,
        address _insuranceFundHolder
    ) public initializer {
        __Ownable_init();

        require(address(_lnAssetSystem) != address(0), "LnPerpExchange: zero address");
        require(address(_lnConfig) != address(0), "LnPerpExchange: zero address");
        require(address(_positionToken) != address(0), "LnPerpExchange: zero address");
        require(address(_lusdToken) != address(0), "LnPerpExchange: zero address");

        lnAssetSystem = _lnAssetSystem;
        lnConfig = _lnConfig;
        positionToken = _positionToken;
        lusdToken = _lusdToken;
        insuranceFundHolder = _insuranceFundHolder;
    }

    function setPoolFeeHolder(address newPoolFeeHolder) external onlyOwner {
        poolFeeHolder = newPoolFeeHolder;

        emit PoolFeeHolderChanged(newPoolFeeHolder);
    }

    function setFoundationFeeHolder(address newFoundationFeeHolder) external onlyOwner {
        foundationFeeHolder = newFoundationFeeHolder;

        emit FoundationFeeHolderChanged(newFoundationFeeHolder);
    }

    function openPosition(
        bytes32 underlying,
        bool isLong,
        uint256 size,
        uint256 collateral
    ) external {
        // TODO: perform basic argument validation

        // Lock up user's lUSD until settlement
        lusdToken.transferFrom(msg.sender, address(this), collateral);

        uint256 actionId = _queueActionMeta(msg.sender, ACTION_TYPE_OPEN_POSITION);
        openPositionActions[actionId] = OpenPositionActionData({
            underlying: underlying,
            isLong: isLong,
            size: size,
            collateral: collateral
        });

        emit OpenPositionActionQueued(actionId, msg.sender, underlying, isLong, size, collateral);
    }

    function increasePosition(
        bytes32 underlying,
        uint256 positionId,
        uint256 size,
        uint256 collateral
    ) external {
        // TODO: perform basic argument validation

        // Lock up user's lUSD until settlement
        lusdToken.transferFrom(msg.sender, address(this), collateral);

        uint256 actionId = _queueActionMeta(msg.sender, ACTION_TYPE_INCREASE_POSITION);
        increasePositionActions[actionId] = IncreasePositionActionData({
            underlying: underlying,
            positionId: positionId,
            size: size,
            collateral: collateral
        });

        emit IncreasePositionActionQueued(actionId, msg.sender, underlying, positionId, size, collateral);
    }

    function closePositionByAmount(
        bytes32 underlying,
        uint256 positionId,
        uint256 amount,
        address to
    ) external {
        // TODO: perform basic argument validation
        require(amount > 0, "LnPerpExchange: zero amount");

        uint256 actionId = _queueActionMeta(msg.sender, ACTION_TYPE_CLOSE_POSITION);
        closePositionActions[actionId] = ClosePositionActionData({
            underlying: underlying,
            positionId: positionId,
            amount: amount,
            to: to
        });

        emit ClosePositionActionQueued(actionId, msg.sender, underlying, positionId, amount, to);
    }

    function closePosition(
        bytes32 underlying,
        uint256 positionId,
        address to
    ) external {
        // TODO: perform basic argument validation

        uint256 actionId = _queueActionMeta(msg.sender, ACTION_TYPE_CLOSE_POSITION);
        closePositionActions[actionId] = ClosePositionActionData({
            underlying: underlying,
            positionId: positionId,
            amount: 0,
            to: to
        });

        emit ClosePositionActionQueued(actionId, msg.sender, underlying, positionId, 0, to);
    }

    function settleAction(uint256 pendingActionId) external {
        PendingActionMeta memory actionMeta = pendingActionMetas[pendingActionId];
        require(actionMeta.actionType > 0, "LnPerpExchange: pending action not found");

        // Assert settlement delay
        uint settlementDelay = lnConfig.getUint(CONFIG_TRADE_SETTLEMENT_DELAY);
        uint256 revertDelay = lnConfig.getUint(CONFIG_TRADE_REVERT_DELAY);
        require(settlementDelay > 0, "LnPerpExchange: settlement delay not set");
        require(revertDelay > 0, "LnPerpExchange: revert delay not set");
        require(block.timestamp >= actionMeta.timestamp + settlementDelay, "LnPerpExchange: settlement delay not passed");
        require(block.timestamp <= actionMeta.timestamp + revertDelay, "LnPerpExchange: action can only be reverted now");

        if (actionMeta.actionType == ACTION_TYPE_OPEN_POSITION) {
            OpenPositionActionData memory data = openPositionActions[pendingActionId];

            ILnPerpetual perpContract = _getPerpContract(data.underlying);
            lusdToken.approve(address(perpContract), data.collateral);
            perpContract.openPosition(actionMeta.user, data.isLong, data.size, data.collateral);
        } else if (actionMeta.actionType == ACTION_TYPE_INCREASE_POSITION) {
            IncreasePositionActionData memory data = increasePositionActions[pendingActionId];

            ILnPerpetual perpContract = _getPerpContract(data.underlying);
            lusdToken.approve(address(perpContract), data.collateral);
            perpContract.increasePosition(actionMeta.user, data.positionId, data.size, data.collateral);
        } else if (actionMeta.actionType == ACTION_TYPE_CLOSE_POSITION) {
            ClosePositionActionData memory data = closePositionActions[pendingActionId];

            if (data.amount > 0) {
                _getPerpContract(data.underlying).closePositionByAmount(
                    actionMeta.user,
                    data.positionId,
                    data.amount,
                    data.to
                );
            } else {
                _getPerpContract(data.underlying).closePosition(actionMeta.user, data.positionId, data.to);
            }
        } else {
            require(false, "LnPerpExchange: unknown action type");
        }

        emit ActionSettled(pendingActionId);
    }

    function revertAction(uint256 pendingActionId) external {
        PendingActionMeta memory actionMeta = pendingActionMetas[pendingActionId];
        require(actionMeta.actionType > 0, "LnPerpExchange: pending action not found");

        // Assert revert delay
        uint256 revertDelay = lnConfig.getUint(CONFIG_TRADE_REVERT_DELAY);
        require(revertDelay > 0, "LnPerpExchange: revert delay not set");
        require(block.timestamp > actionMeta.timestamp + revertDelay, "LnPerpExchange: revert delay not passed");

        // Refund collateral taken
        if (actionMeta.actionType == ACTION_TYPE_OPEN_POSITION) {
            lusdToken.transfer(actionMeta.user, openPositionActions[pendingActionId].collateral);
        } else if (actionMeta.actionType == ACTION_TYPE_INCREASE_POSITION) {
            lusdToken.transfer(actionMeta.user, increasePositionActions[pendingActionId].collateral);
        }

        // Remove action data from storage to save gas
        delete pendingActionMetas[pendingActionId];
        if (actionMeta.actionType == ACTION_TYPE_OPEN_POSITION) {
            delete openPositionActions[pendingActionId];
        } else if (actionMeta.actionType == ACTION_TYPE_INCREASE_POSITION) {
            delete increasePositionActions[pendingActionId];
        } else if (actionMeta.actionType == ACTION_TYPE_CLOSE_POSITION) {
            delete closePositionActions[pendingActionId];
        } else {
            require(false, "LnPerpExchange: unknown action type");
        }

        emit ActionReverted(pendingActionId);
    }

    function submitFees(uint256 positionId, uint256 amount) external override {
        require(poolFeeHolder != address(0), "LnPerpExchange: fee pool not set");

        lusdToken.transferFrom(msg.sender, address(this), amount);

        uint256 foundationSplit;
        if (foundationFeeHolder == address(0)) {
            foundationSplit = 0;
        } else {
            uint256 splitRatio = lnConfig.getUint(CONFIG_FEE_SPLIT);

            if (splitRatio == 0) {
                foundationSplit = 0;
            } else {
                foundationSplit = amount.mul(splitRatio).div(UNIT);
                amount = amount.sub(foundationSplit);
            }
        }

        if (amount > 0) {
            lusdToken.transfer(poolFeeHolder, amount);
        }
        if (foundationSplit > 0) {
            lusdToken.transfer(foundationFeeHolder, foundationSplit);
        }

        emit FeesCharged(positionId, amount, foundationSplit);
    }

    function submitInsuranceFund(uint256 positionId, uint256 amount) external override {
        lusdToken.transferFrom(msg.sender, insuranceFundHolder, amount);
        emit InsuranceFundContribution(positionId, amount);
    }

    function requestPositionMint(address to) external override returns (uint256 positionId) {
        _assertRegisteredPerp(msg.sender);
        positionId = positionToken.mint(msg.sender, to);
    }

    function requestPositionBurn(uint256 positionId) external override {
        _assertRegisteredPerp(msg.sender);
        positionToken.burn(positionId);
    }

    function requestAssetMint(
        address asset,
        address account,
        uint256 amount
    ) external override {
        _assertRegisteredPerp(msg.sender);
        ILnAsset(asset).mint(account, amount);
    }

    function requestAssetBurn(
        address asset,
        address account,
        uint256 amount
    ) external override {
        _assertRegisteredPerp(msg.sender);
        ILnAsset(asset).burn(account, amount);
    }

    function _queueActionMeta(address user, uint8 actionType) private returns (uint256 actionId) {
        actionId = ++lastPendingActionId;
        pendingActionMetas[actionId] = PendingActionMeta({
            timestamp: block.timestamp.toUint64(),
            user: user,
            actionType: actionType
        });
    }

    function _getPerpContract(bytes32 symbol) private view returns (ILnPerpetual) {
        address perpAddress = lnAssetSystem.perpAddresses(symbol);
        require(perpAddress != address(0), "LnPerpExchange: perp address not found");

        return ILnPerpetual(perpAddress);
    }

    function _assertRegisteredPerp(address perpAddress) private view {
        require(lnAssetSystem.isPerpAddressRegistered(perpAddress), "LnPerpExchange: perp address not registered");
    }
}
