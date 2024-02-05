// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SignedSafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/SafeCastUpgradeable.sol";
import "./utilities/TransferHelper.sol";

/**
 * @title LnVaultDynamicInterestPool
 *
 * @dev A subscription-based staking pool with subscription amount limits. Reward (interest) rates are set by
 * the contract owner.
 */
contract LnVaultDynamicInterestPool is OwnableUpgradeable {
    using SafeCastUpgradeable for int256;
    using SafeCastUpgradeable for uint256;
    using SafeMathUpgradeable for uint256;
    using SignedSafeMathUpgradeable for int256;
    using TransferHelper for address;

    event PoolInitialized(
        uint256 firstPeriodStartTime,
        uint256 periodDuration,
        uint256 totalSubscriptionLimit,
        uint256 userSubscriptionLimit,
        address stakeToken,
        address interestToken
    );
    event Subscribed(address indexed user, uint256 indexed periodId, uint256 amount);
    event Unsubscribed(address indexed user, uint256 indexed periodId, uint256 amount);
    event PrincipalWithdrawn(address indexed user, uint256 amount);
    event InterestWithdrawn(
        address indexed user,
        uint256 indexed periodId,
        uint256 principal,
        uint256 interestRate,
        uint256 interest
    );
    event InterestRateSet(uint256 indexed periodId, uint256 interestRate);

    struct UserData {
        uint256 subscribedAmount;
        int256 pendingAmount;
        uint256 pendingAmountPeriodId;
        uint256 lastInterestWithdrawalPeriodId;
        uint256 refundingAmount;
        uint256 refundPeriodId;
    }

    uint256 public firstPeriodStartTime;
    uint256 public periodDuration;
    uint256 public totalSubscriptionLimit;
    uint256 public userSubscriptionLimit;
    address public stakeToken;
    address public interestToken;

    uint256 public totalSubscribedAmount;

    mapping(address => UserData) public userData;
    mapping(uint256 => uint256) public interestRates;

    uint256 public constant INTEREST_RATE_UNIT = 10**18;

    function getWithdrawablePrincipal(address user) external view returns (uint256) {
        UserData memory currentUserData = userData[user];

        if (currentUserData.refundingAmount == 0) return 0;

        uint256 currentPeriodId = getCurrentPeriodId();
        return currentPeriodId >= currentUserData.refundPeriodId ? currentUserData.refundingAmount : 0;
    }

    function getWithdrawableInterests(address user)
        external
        view
        returns (
            uint256 fromPeriodId,
            uint256 toPeriodId,
            uint256 amount
        )
    {
        uint256 currentPeriodId = getCurrentPeriodId();
        UserData memory currentUserData = userData[user];

        // Nothing to withdraw if not subscribed
        if (currentUserData.subscribedAmount == 0) {
            return (0, 0, 0);
        }

        uint256 firstClaimablePeriodId = currentUserData.lastInterestWithdrawalPeriodId + 1;

        uint256 periodCount = 0;
        uint256 accumulatedInterest = 0;

        for (uint256 periodId = firstClaimablePeriodId; periodId < currentPeriodId; periodId++) {
            uint256 periodInterestRate = interestRates[periodId];
            if (periodInterestRate == 0) break;

            uint256 periodPrincipal = currentUserData.subscribedAmount;
            if (currentUserData.pendingAmountPeriodId > 0 && currentUserData.pendingAmountPeriodId < periodId) {
                periodPrincipal = periodPrincipal.toInt256().add(currentUserData.pendingAmount).toUint256();
            }

            periodCount++;
            accumulatedInterest = accumulatedInterest.add(periodPrincipal.mul(periodInterestRate).div(INTEREST_RATE_UNIT));
        }

        return
            periodCount == 0
                ? (0, 0, 0)
                : (firstClaimablePeriodId, firstClaimablePeriodId + periodCount - 1, accumulatedInterest);
    }

    function getCurrentPeriodId() public view returns (uint256) {
        return block.timestamp < firstPeriodStartTime ? 0 : (block.timestamp - firstPeriodStartTime) / periodDuration + 1;
    }

    function __LnVaultDynamicInterestPool_init(
        uint256 _firstPeriodStartTime,
        uint256 _periodDuration,
        uint256 _totalSubscriptionLimit,
        uint256 _userSubscriptionLimit,
        address _stakeToken,
        address _interestToken
    ) public initializer {
        __Ownable_init();

        require(_firstPeriodStartTime > block.timestamp, "LnVaultDynamicInterestPool: invalid time range");
        require(_periodDuration > 0, "LnVaultDynamicInterestPool: zero duration");
        require(_totalSubscriptionLimit > 0, "LnVaultDynamicInterestPool: zero subscription limit");
        require(_stakeToken != address(0), "LnVaultDynamicInterestPool: zero address");
        require(_interestToken != address(0), "LnVaultDynamicInterestPool: zero address");

        firstPeriodStartTime = _firstPeriodStartTime;
        periodDuration = _periodDuration;
        totalSubscriptionLimit = _totalSubscriptionLimit;
        userSubscriptionLimit = _userSubscriptionLimit;
        stakeToken = _stakeToken;
        interestToken = _interestToken;

        emit PoolInitialized(
            _firstPeriodStartTime,
            _periodDuration,
            _totalSubscriptionLimit,
            _userSubscriptionLimit,
            _stakeToken,
            _interestToken
        );
    }

    function subscribe(uint256 amount) external {
        _subscribe(msg.sender, amount);
    }

    function unsubscribe(uint256 amount) external {
        _unsubscribe(msg.sender, amount);
    }

    function withdrawPrincipal() external {
        _withdrawPrincipal(msg.sender);
    }

    function withdrawInterest(uint256 periodId) external {
        _withdrawInterest(msg.sender, periodId);
    }

    function withdrawInterests(uint256 fromPeriodId, uint256 toPeriodId) external {
        require(fromPeriodId > 0 && toPeriodId >= fromPeriodId, "LnVaultDynamicInterestPool: invalid period range");

        for (uint256 periodId = fromPeriodId; periodId <= toPeriodId; periodId++) {
            _withdrawInterest(msg.sender, periodId);
        }
    }

    function setInterestRate(uint256 periodId, uint256 interestRate) external onlyOwner {
        require(periodId > 0, "LnVaultDynamicInterestPool: invalid period id");
        require(interestRate > 0, "LnVaultDynamicInterestPool: zero rate");

        require(interestRates[periodId] == 0, "LnVaultDynamicInterestPool: rate already set");

        interestRates[periodId] = interestRate;
        emit InterestRateSet(periodId, interestRate);
    }

    function _subscribe(address user, uint256 amount) private {
        _adjustSubscription(user, amount.toInt256());
    }

    function _unsubscribe(address user, uint256 amount) private {
        _adjustSubscription(user, -amount.toInt256());
    }

    function _adjustSubscription(address user, int256 amount) private {
        require(amount != 0, "LnVaultDynamicInterestPool: zero amount");

        uint256 currentPeriodId = getCurrentPeriodId();
        UserData memory currentUserData = userData[user];

        // User didn't have subscription before. Will start earning interest from next period
        if (amount > 0 && currentUserData.subscribedAmount == 0) {
            // Only update state if it's different to save gas
            if (currentUserData.lastInterestWithdrawalPeriodId != currentPeriodId) {
                userData[user].lastInterestWithdrawalPeriodId = currentPeriodId;

                // Also update the memory copy since we'll need it later
                currentUserData.lastInterestWithdrawalPeriodId = currentPeriodId;
            }
        }

        if (currentUserData.lastInterestWithdrawalPeriodId == currentPeriodId) {
            // User isn't earning interest for the current period. The amount can be changed directly

            int256 newAmountSigned = currentUserData.subscribedAmount.toInt256().add(amount);
            require(newAmountSigned >= 0, "LnVaultDynamicInterestPool: insufficient amount");

            uint256 newAmountUnsigned = newAmountSigned.toUint256();
            require(newAmountUnsigned <= userSubscriptionLimit, "LnVaultDynamicInterestPool: user oversubscribed");

            userData[user].subscribedAmount = newAmountUnsigned;
        } else {
            // User already making interest for the current period. Need to maintain the amount and put the changes in pending instead

            // Must settle the already-pending amount first by withdrawing interests
            require(
                currentUserData.pendingAmountPeriodId == 0 || currentUserData.pendingAmountPeriodId == currentPeriodId,
                "LnVaultDynamicInterestPool: amount change pending"
            );

            int256 newPendingAmount = currentUserData.pendingAmount.add(amount);

            int256 newOverallAmountSigned = newPendingAmount.add(currentUserData.subscribedAmount.toInt256());
            require(newOverallAmountSigned >= 0, "LnVaultDynamicInterestPool: insufficient amount");

            require(
                newOverallAmountSigned.toUint256() <= userSubscriptionLimit,
                "LnVaultDynamicInterestPool: user oversubscribed"
            );

            userData[user].pendingAmount = newPendingAmount;
            if (currentUserData.pendingAmountPeriodId != currentPeriodId) {
                userData[user].pendingAmountPeriodId = currentPeriodId;
            }
        }

        totalSubscribedAmount = totalSubscribedAmount.toInt256().add(amount).toUint256();
        require(totalSubscribedAmount <= totalSubscriptionLimit, "LnVaultDynamicInterestPool: total oversubscribed");

        if (amount > 0) {
            stakeToken.safeTransferFrom(user, address(this), amount.toUint256());

            emit Subscribed(user, currentPeriodId, amount.toUint256());
        } else {
            // Must withdraw previous pending refunds first
            require(
                currentUserData.refundPeriodId == currentPeriodId + 1 ||
                    (currentUserData.refundingAmount == 0 && currentUserData.refundPeriodId == 0),
                "LnVaultDynamicInterestPool: withdraw pending refund first"
            );

            userData[user].refundingAmount = currentUserData.refundingAmount.add((-amount).toUint256());
            if (currentUserData.refundPeriodId == 0) {
                userData[user].refundPeriodId = currentPeriodId + 1;
            }

            emit Unsubscribed(user, currentPeriodId, (-amount).toUint256());
        }
    }

    function _withdrawPrincipal(address user) private {
        uint256 currentPeriodId = getCurrentPeriodId();
        uint256 refundingAmount = userData[user].refundingAmount;
        uint256 refundPeriodId = userData[user].refundPeriodId;

        require(refundingAmount > 0, "LnVaultDynamicInterestPool: no refund pending");
        require(currentPeriodId >= refundPeriodId, "LnVaultDynamicInterestPool: refund still pending");

        userData[user].refundingAmount = 0;
        userData[user].refundPeriodId = 0;

        stakeToken.safeTransfer(user, refundingAmount);

        emit PrincipalWithdrawn(user, refundingAmount);
    }

    function _withdrawInterest(address user, uint256 periodId) private {
        uint256 currentPeriodId = getCurrentPeriodId();
        UserData memory currentUserData = userData[user];

        require(periodId < currentPeriodId, "LnVaultDynamicInterestPool: period not ended");
        require(
            periodId == currentUserData.lastInterestWithdrawalPeriodId + 1,
            "LnVaultDynamicInterestPool: invalid period id"
        );

        // It should actually be impossible for this to not hold. We're still asserting it here just to be safe.
        require(
            currentUserData.pendingAmountPeriodId == 0 || currentUserData.pendingAmountPeriodId >= periodId,
            "LnVaultDynamicInterestPool: unexpected pending changes"
        );

        // Mark period as claimed
        userData[user].lastInterestWithdrawalPeriodId = periodId;

        // No need to retain the amount before pending changes anymore since it was just used for the last time
        if (currentUserData.pendingAmountPeriodId == periodId) {
            userData[user].subscribedAmount = currentUserData
                .subscribedAmount
                .toInt256()
                .add(currentUserData.pendingAmount)
                .toUint256();
            userData[user].pendingAmount = 0;
            userData[user].pendingAmountPeriodId = 0;
        }

        uint256 periodInterestRate = interestRates[periodId];
        require(periodInterestRate > 0, "LnVaultDynamicInterestPool: interest rate not set");

        uint256 principal = currentUserData.subscribedAmount; // subscribedAmount here is before pending changes settlement (memory copy)
        uint256 interestPayment = principal.mul(periodInterestRate).div(INTEREST_RATE_UNIT);

        // It's possible that principal is so small that interest is zero
        if (interestPayment > 0) {
            interestToken.safeTransfer(user, interestPayment);
        }

        emit InterestWithdrawn(user, periodId, principal, periodInterestRate, interestPayment);
    }
}
