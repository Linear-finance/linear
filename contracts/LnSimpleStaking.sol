// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./LnAdmin.sol";
import "./LnOperatorModifier.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./LnAccessControl.sol";
import "./LnLinearStaking.sol";
import "./SafeDecimalMath.sol";


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


    function calcReward( uint256 curBlock, address _user) public view returns (uint256) {
        PoolInfo storage pool = mPoolInfo;
        UserInfo storage user = userInfo[_user];
        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 lpSupply = pool.amount;
        if (curBlock > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = curBlock.sub( pool.lastRewardBlock );
            uint256 curReward = multiplier.mul(rewardPerBlock);
            accRewardPerShare = accRewardPerShare.add(curReward.mul(1e12).div(lpSupply));
        }
        uint newReward = user.amount.mul(accRewardPerShare).div(1e12).sub(user.rewardDebt);
        return newReward.add( user.reward );
    }


    function rewardOf( address _user ) public view returns( uint256 ){
        return userInfo[_user].reward;
    }


    function amount( ) public view returns( uint256 ){
        return mPoolInfo.amount;
    }

    function amountOf( address _user ) public view returns( uint256 ){
        return userInfo[_user].amount;
    }


    function _update( uint256 curBlock ) internal {
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

    function _deposit( uint256 curBlock, address _addr, uint256 _amount) internal {
        PoolInfo storage pool = mPoolInfo;
        UserInfo storage user = userInfo[ _addr];
        _update( curBlock );
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

    function _withdraw( uint256 curBlock, address _addr, uint256 _amount) internal {
        PoolInfo storage pool = mPoolInfo;
        UserInfo storage user = userInfo[_addr];
        require(user.amount >= _amount, "_withdraw: not good");
        _update( curBlock );
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

contract LnRewardCalculatorTest is LnRewardCalculator{
    constructor( uint256 _rewardPerBlock, uint256 _startBlock ) public 
        LnRewardCalculator( _rewardPerBlock, _startBlock ) {
    }

    function deposit( uint256 curBlock, address _addr, uint256 _amount) public {
        _deposit( curBlock, _addr, _amount );
    }

    function withdraw( uint256 curBlock, address _addr, uint256 _amount) public {
        _withdraw( curBlock, _addr, _amount );
    }
}


contract LnSimpleStaking is LnAdmin, Pausable, ILinearStaking, LnRewardCalculator {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    IERC20 public linaToken; // lina token proxy address
    LnLinearStakingStorage public stakingStorage;
    uint256 public endBlock;
    uint256 public mScaleFactor;

    constructor(
        address _admin,
        address _linaToken,
        address _storage, uint256 _rewardPerBlock, uint256 _startBlock, uint256 _endBlock, uint256 _scaleFactor
    ) public LnAdmin(_admin) LnRewardCalculator(_rewardPerBlock, _startBlock ){
        linaToken = IERC20(_linaToken);
        stakingStorage = LnLinearStakingStorage(_storage);
        endBlock = _endBlock;
        mScaleFactor = _scaleFactor;
    }

    function setLinaToken(address _linaToken) external onlyAdmin {
        linaToken = IERC20(_linaToken);
    }

    function setPaused(bool _paused) external onlyAdmin {
        if (_paused) {
            _pause();
        } else {
            _unpause();
        }
    }

    //////////////////////////////////////////////////////
    event Staking(address indexed who, uint256 value, uint staketime);
    event CancelStaking(address indexed who, uint256 value);
    event Claim(address indexed who, uint256 rewardval, uint256 totalStaking);

    uint256 public accountStakingListLimit = 50;
    uint256 public minStakingAmount = 1e18; // 1 token
    uint256 public constant PRECISION_UINT = 1e23;

    function setLinaTokenAddress(address _token) external onlyAdmin {
        linaToken = IERC20(_token);
    }

    function setStakingListLimit(uint256 _limit) external onlyAdmin {
        accountStakingListLimit = _limit;
    }

    function setMinStakingAmount(uint256 _minStakingAmount) external onlyAdmin {
        minStakingAmount = _minStakingAmount;
    }

    function stakingBalanceOf(address account) external override view returns(uint256) {
        return stakingStorage.stakingBalanceOf(account);
    }

    function getStakesdataLength(address account) external view returns(uint256) {
        return stakingStorage.getStakesdataLength(account);
    }
    //--------------------------------------------------------

    function staking(uint256 amount) public whenNotPaused override returns (bool) {
        stakingStorage.requireInStakingPeriod();

        require(amount >= minStakingAmount, "Staking amount too small.");
        require(stakingStorage.getStakesdataLength(msg.sender) < accountStakingListLimit, "Staking list out of limit.");

        //linaToken.burn(msg.sender, amount);
        linaToken.transferFrom(msg.sender, address(this), amount);
     
        stakingStorage.PushStakingData(msg.sender, amount, block.timestamp);
        stakingStorage.AddWeeksTotal(block.timestamp, amount);

        super._deposit( block.number, msg.sender, amount );
        emit Staking(msg.sender, amount, block.timestamp);
        return true;
    }

    function cancelStaking(uint256 amount) public whenNotPaused override returns (bool) {
        stakingStorage.requireInStakingPeriod();

        require(amount > 0, "Invalid amount.");

        uint256 returnToken = amount;
        for (uint256 i = stakingStorage.getStakesdataLength(msg.sender); i >= 1 ; i--) {
            (uint256 stakingAmount, uint256 staketime) = stakingStorage.getStakesDataByIndex(msg.sender, i-1);
            if (amount >= stakingAmount) {
                amount = amount.sub(stakingAmount);
                
                stakingStorage.PopStakesData(msg.sender);
                stakingStorage.SubWeeksTotal(staketime, stakingAmount);
            } else {
                stakingStorage.StakingDataSub(msg.sender, i-1, amount);
                stakingStorage.SubWeeksTotal(staketime, amount);

                amount = 0;
            }
            if (amount == 0) break;
        }
        require(amount == 0, "Cancel amount too big then staked.");

        //linaToken.mint(msg.sender, returnToken);
        linaToken.transfer(msg.sender, returnToken);

        super._withdraw( block.number, msg.sender, returnToken );

        emit CancelStaking(msg.sender, returnToken);

        return true;
    }

    function getTotalReward( uint blockNb, address _user ) internal returns( uint256 total ){
        uint256[] memory finalTotals = stakingStorage.weekTotalStaking();
        for (uint256 i=0; i < stakingStorage.getStakesdataLength( _user ); i++) {
            (uint256 stakingAmount, uint256 staketime) = stakingStorage.getStakesDataByIndex( _user, i);
            total = total.add( stakingAmount.multiplyDecimal( mScaleFactor ) );
        }

        uint256 reward = super.calcReward( blockNb, _user );
        total = total.add( reward );
    }


    // claim reward
    // Note: 需要提前提前把奖励token转进来
    function claim() public whenNotPaused override returns (bool) {
        stakingStorage.requireStakingEnd();

        require(stakingStorage.getStakesdataLength(msg.sender) > 0, "Nothing to claim");

        //uint256 reward = super.calcReward( endBlock, msg.sender );
        uint256 reward = getTotalReward( endBlock, msg.sender );
        uint256 amount = super.amountOf( msg.sender );

        stakingStorage.DeleteStakesData(msg.sender);
        
        //linaToken.mint(msg.sender, totalStaking.add(totalReward) );
        linaToken.transfer(msg.sender, amount.add(reward) );

        emit Claim(msg.sender, reward, amount);
        return true;
    }
}