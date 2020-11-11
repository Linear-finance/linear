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
        sEndblock = simpleStaking.mEndBlock();
        total.add(simpleStaking.getTotalReward(sEndblock, _user));
        
        for(uint256 i; i < stakingRewardList.length; i++) {
            LnStakingReward staking = LnStakingReward(stakingRewardList[i]);
            if (staking.mEndBlock() < blockNb){
                total.add(staking.getTotalReward(staking.mEndBlock(), _user));
            } else {
                total.add(staking.getTotalReward(blockNb, _user));
            }

        }
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
