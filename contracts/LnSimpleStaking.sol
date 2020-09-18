// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./LnAdmin.sol";
import "./LnOperatorModifier.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./LnAccessControl.sol";
import "./LnLinearStaking.sol";


contract LnRewardCalculator  {
    using SafeMath for uint256;

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

    uint256 public rewardPerBlock;

    PoolInfo public mPoolInfo;
    mapping (address => UserInfo) public userInfo;

    uint256 public startBlock;
    uint256 public remainReward;
    uint256 public accReward;

    constructor( uint256 _rewardPerBlock, uint256 _startBlock ) public {
        rewardPerBlock = _rewardPerBlock;
        startBlock = _startBlock;
        mPoolInfo.lastRewardBlock = startBlock;
    }


    function calcReward( uint256 curBlock, address _user) external view returns (uint256) {
        PoolInfo storage pool = mPoolInfo;
        UserInfo storage user = userInfo[_user];
        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 lpSupply = pool.amount;
        if (curBlock > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = curBlock.sub( pool.lastRewardBlock );
            uint256 curReward = multiplier.mul(rewardPerBlock);
            accRewardPerShare = accRewardPerShare.add(curReward.mul(1e12).div(lpSupply));
        }
        return user.amount.mul(accRewardPerShare).div(1e12).sub(user.rewardDebt);
    }

    function rewardOf( address _user ) external view returns( uint256 ){
        return userInfo[_user].reward;
    }


    function amount( ) external view returns( uint256 ){
        return mPoolInfo.amount;
    }

    function amountOf( address _user ) external view returns( uint256 ){
        return userInfo[_user].amount;
    }


    function update( uint256 curBlock ) public {
        PoolInfo storage pool = mPoolInfo;
        if (curBlock <= pool.lastRewardBlock) {
            return;
        }
        uint256 lpSupply = pool.amount;
        if (lpSupply == 0) {
            pool.lastRewardBlock = curBlock;
            return;
        }
        uint256 multiplier = curBlock.sub( pool.lastRewardBlock );
        uint256 curReward = multiplier.mul(rewardPerBlock);
        
        remainReward = remainReward.add( curReward );
        accReward = accReward.add( curReward );

        pool.accRewardPerShare = pool.accRewardPerShare.add(curReward.mul(1e12).div(lpSupply));
        pool.lastRewardBlock = curBlock;
    }

    function deposit( uint256 curBlock, address _addr, uint256 _amount) public {
        PoolInfo storage pool = mPoolInfo;
        UserInfo storage user = userInfo[ _addr];
        update( curBlock );
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accRewardPerShare).div(1e12).sub(user.rewardDebt);
            if(pending > 0) {
                reward( user, pending );
            }
        }
        if(_amount > 0) {
            user.amount = user.amount.add(_amount);
            pool.amount = pool.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accRewardPerShare).div(1e12);
    }

    function withdraw( uint256 curBlock, address _addr, uint256 _amount) public {
        PoolInfo storage pool = mPoolInfo;
        UserInfo storage user = userInfo[_addr];
        require(user.amount >= _amount, "withdraw: not good");
        update( curBlock );
        uint256 pending = user.amount.mul(pool.accRewardPerShare).div(1e12).sub(user.rewardDebt);
        if(pending > 0) {
            reward( user, pending );
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount);
            pool.amount = pool.amount.sub(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accRewardPerShare).div(1e12);
    }

    function reward( UserInfo storage user, uint256 _amount) internal {
        if (_amount > remainReward) {
            _amount = remainReward;
        }
        remainReward = remainReward.sub( _amount );
        user.reward = user.reward.add( _amount );
    }

}


