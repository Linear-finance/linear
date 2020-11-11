// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./LnAdmin.sol";
import "./LnOperatorModifier.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./LnAccessControl.sol";
import "./LnSimpleStaking.sol";
import "./SafeDecimalMath.sol";

//Manage all staking pools
//Tow type staking 1:simpleStaking 2:simpleStakingExtension
contract LnStakingRewardSystem is
    LnAdmin,
    Pausable
{
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    uint256 public mEndBlock;

    uint256 public claimRewardLockTime = 1620806400; // 2021-5-12

    LnSimpleStaking public simpleStaking;

    address[] public  stakingRewardList;

    struct UserInfo {
        uint256 reward;
        uint256 amount;
        uint256 rewardDebt;
    }

    struct PoolInfo {
        uint256 amount;
        uint256 lastRewardBlock;
        uint256 accRewardPerShare;
    }

    constructor(
        address _admin,
        address _simpleStaking,
        uint256 _endBlock
    ) public LnAdmin(_admin) {
        mEndBlock = _endBlock;
        simpleStaking = LnSimpleStaking(_simpleStaking);

    }


    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }
    //必须按stakingPool的向后顺序一个一个设置
    //deploy 合约后必须添加 staking pool
    function setStakingPoolList(address[] memory stakingRewardAddress) public onlyAdmin {
        for (uint256 i; i < stakingRewardAddress.length; i++){
            stakingRewardList.push(stakingRewardAddress[i]);
        }
    }

    //////////////////////////////////////////////////////
    event Staking(address indexed who, uint256 value, uint256 staketime);
    event CancelStaking(address indexed who, uint256 value);
    event Claim(address indexed who, uint256 rewardval, uint256 totalStaking);
    event TransLock(address target, uint256 time);

    uint256 public minStakingAmount = 1e18; // 1 token
    uint256 public constant PRECISION_UINT = 1e23;

    function setEndBlock(uint256 _newEndBlock) external onlyAdmin {
        require(
            _newEndBlock > mEndBlock,
            "new endBlock less than old endBlock."
        );
        mEndBlock = _newEndBlock;
    }

    function stakingBalanceOf(address account)
        external
        view
        returns (uint256)
    {
        uint256 totalStakingBalance = 0;

        totalStakingBalance.add(simpleStaking.stakingBalanceOf(account));

        for(uint256 i; i < stakingRewardList.length; i++) {
            LnStakingReward staking = LnStakingReward(stakingRewardList[i]);
            totalStakingBalance.add(staking.stakingBalanceOf(account));
        }
        return totalStakingBalance;
    }

    function staking(uint256 amount)
        public
        whenNotPaused
        returns (bool)
    {
        require(amount >= minStakingAmount, "Staking amount too small.");
        //require(stakingStorage.getStakesdataLength(msg.sender) < accountStakingListLimit, "Staking list out of limit.");
        uint256 blockNb = block.number;
        for(uint256 i; i < stakingRewardList.length; i++) {
            LnStakingReward staking = LnStakingReward(stakingRewardList[i]);
            if(staking.mEndBlock() > blockNb){
                staking.staking(amount);
                return true;
            }
        }

        return true;
    }
    //由最早的staking 开始 unstaking
    function cancelStaking(uint256 amount)
        public
        whenNotPaused
        returns (bool)
    {
        require(amount > 0, "Invalid amount.");
        uint256 userAmountInStaking = 0;

        (userAmountInStaking,,) = simpleStaking.getUserInfo(msg.sender);
        if (userAmountInStaking > amount){
            simpleStaking.cancelStaking(amount);
            return true;
        } else {
            simpleStaking.cancelStaking(userAmountInStaking);
            amount = amount.sub(userAmountInStaking, "cr userAmountInStaking sub overflow");
        }

        for(uint256 i; i < stakingRewardList.length; i++) {
            LnStakingReward staking = LnStakingReward(stakingRewardList[i]);
            (userAmountInStaking,,) = staking.getUserInfo(msg.sender);
            if (userAmountInStaking > amount){
                staking.cancelStaking(amount);
                return true;
            } else {
                staking.cancelStaking(userAmountInStaking);
                amount = amount.sub(userAmountInStaking, "cr userAmountInStaking sub overflow");
            }

        }

        return true;
    }

    function getTotalReward(uint256 blockNb, address _user)
        public
        view
        returns (uint256 total)
    {
        if (blockNb > mEndBlock) {
            blockNb = mEndBlock;
        }
        total = 0;
        uint256 sEndblock = 0;
        uint256 rewardPerBlock;
        PoolInfo memory pool;
        UserInfo  memory user;
        (pool.amount, pool.lastRewardBlock, pool.accRewardPerShare) = simpleStaking.mPoolInfo();
        (user.reward, user.amount, user.rewardDebt) = simpleStaking.getUserInfo(_user);

        for(uint256 i; i < stakingRewardList.length; i++) {
            LnStakingReward staking = LnStakingReward(stakingRewardList[i]);
            uint256 reward;
            uint256 amount;
            uint256 rewardDebt;
            uint256 uamount;
            uint256 lastRewardBlock;
            uint256 accRewardPerShare;
            (amount, lastRewardBlock, accRewardPerShare) = staking.mPoolInfo();
            (reward, uamount, rewardDebt) = staking.getUserInfo(_user);

            pool.amount = pool.amount.add(amount);
            pool.lastRewardBlock = lastRewardBlock;
            pool.accRewardPerShare = accRewardPerShare;
            user.reward = user.reward.add(reward);
            user.amount = user.amount.add(uamount);
            user.rewardDebt = user.rewardDebt.add(rewardDebt);

            rewardPerBlock = staking.rewardPerBlock();
        }

        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 lpSupply = pool.amount;
        if (blockNb > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = blockNb.sub(
                pool.lastRewardBlock,
                "cr curBlock sub overflow"
            );
            uint256 curReward = multiplier.mul(rewardPerBlock);
            accRewardPerShare = accRewardPerShare.add(
                curReward.mul(1e20).div(lpSupply)
            );
        }
        uint256 newReward = user.amount.mul(accRewardPerShare).div(1e20).sub(
            user.rewardDebt,
            "cr newReward sub overflow"
        );
        return newReward.add(user.reward);

    }

    // claim reward
    // Note: 需要提前提前把奖励token转进来
    function claim() public  whenNotPaused returns (bool) {
        require(
            block.timestamp > claimRewardLockTime,
            "Not time to claim reward"
        );

        simpleStaking.claim();

        for(uint256 i; i < stakingRewardList.length; i++) {
            LnStakingReward staking = LnStakingReward(stakingRewardList[i]);
            staking.claim();
        }
        return true;
    }

    function setRewardLockTime(uint256 newtime) public onlyAdmin {
        claimRewardLockTime = newtime;
    }

}
