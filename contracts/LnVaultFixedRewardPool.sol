// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/MathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "./utilities/TransferHelper.sol";

/**
 * @title LnVaultFixedRewardPool
 *
 * @dev A token staking pool where a fixed amount of rewards are released every second, and distributed
 * to pool participants on a pro-rata basis.
 */
contract LnVaultFixedRewardPool is OwnableUpgradeable {
    using MathUpgradeable for uint256;
    using SafeMathUpgradeable for uint256;
    using TransferHelper for address;

    event PoolInitialized(uint256 startTime, uint256 rewardPerSecond, address stakeToken, address rewardToken);
    event Staked(address indexed staker, address token, uint256 amount);
    event Unstaked(address indexed staker, address token, uint256 amount);
    event RewardClaimed(address indexed staker, address token, uint256 amount);
    event RewardPerSecondChanged(uint256 oldRewardPerSecond, uint256 newRewardPerSecond);

    struct UserData {
        uint256 stakeAmount;
        uint256 pendingReward;
        uint256 entryAccuRewardPerShare;
    }

    // Pool config
    uint256 public startTime;
    uint256 public rewardPerSecond;
    address public stakeToken;
    address public rewardToken;

    // Pool data
    uint256 public totalStakeAmount;
    uint256 public accuRewardPerShare;
    uint256 public accuRewardLastUpdateTime;
    mapping(address => UserData) public userData;

    uint256 private constant ACCU_REWARD_MULTIPLIER = 10**20; // Precision loss prevention

    modifier onlyStarted() {
        require(block.timestamp >= startTime, "LnVaultFixedRewardPool: pool not started");
        _;
    }

    function getReward(address staker) external view returns (uint256) {
        UserData memory currentUserData = userData[staker];

        uint256 latestAccuRewardPerShare =
            totalStakeAmount > 0
                ? accuRewardPerShare.add(
                    block.timestamp.sub(accuRewardLastUpdateTime).mul(rewardPerSecond).mul(ACCU_REWARD_MULTIPLIER).div(
                        totalStakeAmount
                    )
                )
                : accuRewardPerShare;

        return
            currentUserData.pendingReward.add(
                currentUserData.stakeAmount.mul(latestAccuRewardPerShare.sub(currentUserData.entryAccuRewardPerShare)).div(
                    ACCU_REWARD_MULTIPLIER
                )
            );
    }

    function __LnVaultFixedRewardPool_init(
        uint256 _startTime,
        uint256 _rewardPerSecond,
        address _stakeToken,
        address _rewardToken
    ) public initializer {
        __Ownable_init();

        require(_startTime > block.timestamp, "LnVaultFixedRewardPool: invalid start time");
        require(_rewardPerSecond > 0, "LnVaultFixedRewardPool: zero reward");
        require(_stakeToken != address(0), "LnVaultFixedRewardPool: zero address");
        require(_rewardToken != address(0), "LnVaultFixedRewardPool: zero address");

        startTime = _startTime;
        rewardPerSecond = _rewardPerSecond;
        stakeToken = _stakeToken;
        rewardToken = _rewardToken;

        accuRewardLastUpdateTime = _startTime;

        emit PoolInitialized(_startTime, _rewardPerSecond, _stakeToken, _rewardToken);
    }

    function stake(uint256 amount) external onlyStarted {
        _updateAccuReward();
        _updateStakerReward(msg.sender);

        _stake(msg.sender, amount);
    }

    function unstake(uint256 amount) external {
        _updateAccuReward();
        _updateStakerReward(msg.sender);

        _unstake(msg.sender, amount);
    }

    function claimReward() external {
        _updateAccuReward();
        _updateStakerReward(msg.sender);

        uint256 rewardToClaim = userData[msg.sender].pendingReward;
        require(rewardToClaim > 0, "LnVaultFixedRewardPool: no reward to claim");

        userData[msg.sender].pendingReward = 0;

        rewardToken.safeTransfer(msg.sender, rewardToClaim);

        emit RewardClaimed(msg.sender, rewardToken, rewardToClaim);
    }

    function setRewardPerSecond(uint256 newRewardPerSecond) external onlyOwner {
        // "Settle" rewards up to this block if pool already started
        if (block.timestamp >= startTime) {
            _updateAccuReward();
        }

        uint256 oldRewardPerSecond = rewardPerSecond;
        rewardPerSecond = newRewardPerSecond;

        emit RewardPerSecondChanged(oldRewardPerSecond, newRewardPerSecond);
    }

    function _stake(address user, uint256 amount) private {
        require(amount > 0, "LnVaultFixedRewardPool: cannot stake zero amount");

        userData[user].stakeAmount = userData[user].stakeAmount.add(amount);
        totalStakeAmount = totalStakeAmount.add(amount);

        stakeToken.safeTransferFrom(user, address(this), amount);

        emit Staked(user, stakeToken, amount);
    }

    function _unstake(address user, uint256 amount) private {
        require(amount > 0, "LnVaultFixedRewardPool: cannot unstake zero amount");

        // No sufficiency check required as sub() will throw anyways
        userData[user].stakeAmount = userData[user].stakeAmount.sub(amount);
        totalStakeAmount = totalStakeAmount.sub(amount);

        stakeToken.safeTransfer(user, amount);

        emit Unstaked(user, stakeToken, amount);
    }

    function _updateAccuReward() private {
        uint256 durationInSeconds = block.timestamp.sub(accuRewardLastUpdateTime);

        // This saves tx cost when being called multiple times in the same block
        if (durationInSeconds > 0) {
            // No need to update the rate if no one staked at all
            if (totalStakeAmount > 0) {
                accuRewardPerShare = accuRewardPerShare.add(
                    durationInSeconds.mul(rewardPerSecond).mul(ACCU_REWARD_MULTIPLIER).div(totalStakeAmount)
                );
            }
            accuRewardLastUpdateTime = block.timestamp;
        }
    }

    function _updateStakerReward(address staker) private {
        UserData storage currentUserData = userData[staker];

        uint256 accuDifference = accuRewardPerShare.sub(currentUserData.entryAccuRewardPerShare);

        if (accuDifference > 0) {
            currentUserData.pendingReward = currentUserData.pendingReward.add(
                currentUserData.stakeAmount.mul(accuDifference).div(ACCU_REWARD_MULTIPLIER)
            );
            currentUserData.entryAccuRewardPerShare = accuRewardPerShare;
        }
    }
}
