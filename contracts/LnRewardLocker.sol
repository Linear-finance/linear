// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "./interfaces/ILnAccessControl.sol";
import "./interfaces/ILnRewardLocker.sol";
import "./upgradeable/LnAdminUpgradeable.sol";

/**
 * @title LnRewardLocker
 *
 * @dev A contract for locking LINA rewards. The current version only supports adding rewards.
 * Reward claiming will be added in a later iteration.
 */
contract LnRewardLocker is ILnRewardLocker, LnAdminUpgradeable {
    using SafeMathUpgradeable for uint256;

    event RewardEntryAdded(uint256 entryId, address user, uint256 amount, uint256 unlockTime);

    /**
     * @dev The struct used to store reward data. Address is deliberately left out and put in the
     * mapping key of `rewardEntries` to minimize struct size. Struct fields are padded to 256 bits
     * to save storage space, and thus gas fees.
     */
    struct RewardEntry {
        uint216 amount;
        uint40 unlockTime;
    }

    uint256 public lastRewardEntryId;
    mapping(uint256 => mapping(address => RewardEntry)) public rewardEntries;
    mapping(address => uint256) public lockedAmountByAddresses;
    uint256 public override totalLockedAmount;

    address public linaTokenAddr;
    ILnAccessControl public accessCtrl;

    bytes32 private constant ROLE_LOCK_REWARD = "LOCK_REWARD";

    modifier onlyLockRewardRole() {
        require(accessCtrl.hasRole(ROLE_LOCK_REWARD, msg.sender), "LnAssetUpgradeable: not LOCK_REWARD role");
        _;
    }

    function balanceOf(address user) external view override returns (uint256) {
        return lockedAmountByAddresses[user];
    }

    function __LnRewardLocker_init(
        address _linaTokenAddr,
        ILnAccessControl _accessCtrl,
        address _admin
    ) public initializer {
        __LnAdminUpgradeable_init(_admin);

        require(_linaTokenAddr != address(0), "LnRewardLocker: zero address");
        require(address(_accessCtrl) != address(0), "LnRewardLocker: zero address");

        linaTokenAddr = _linaTokenAddr;
        accessCtrl = _accessCtrl;
    }

    function addReward(
        address user,
        uint256 amount,
        uint256 unlockTime
    ) external override onlyLockRewardRole {
        _addReward(user, amount, unlockTime);
    }

    /**
     * @dev A temporary function for migrating reward entries in bulk from the old contract.
     * To be removed via a contract upgrade after migration.
     */
    function migrateRewards(
        address[] calldata users,
        uint256[] calldata amounts,
        uint256[] calldata unlockTimes
    ) external onlyAdmin {
        require(users.length > 0, "LnRewardLocker: empty array");
        require(users.length == amounts.length && amounts.length == unlockTimes.length, "LnRewardLocker: length mismatch");

        for (uint256 ind = 0; ind < users.length; ind++) {
            _addReward(users[ind], amounts[ind], unlockTimes[ind]);
        }
    }

    function _addReward(
        address user,
        uint256 amount,
        uint256 unlockTime
    ) private {
        require(amount > 0, "LnRewardLocker: zero amount");

        uint216 trimmedAmount = uint216(amount);
        uint40 trimmedUnlockTime = uint40(unlockTime);
        require(uint256(trimmedAmount) == amount, "LnRewardLocker: reward amount overflow");
        require(uint256(trimmedUnlockTime) == unlockTime, "LnRewardLocker: unlock time overflow");

        lastRewardEntryId++;

        rewardEntries[lastRewardEntryId][user] = RewardEntry({amount: trimmedAmount, unlockTime: trimmedUnlockTime});
        lockedAmountByAddresses[user] = lockedAmountByAddresses[user].add(amount);
        totalLockedAmount = totalLockedAmount.add(amount);

        emit RewardEntryAdded(lastRewardEntryId, user, amount, unlockTime);
    }
}
