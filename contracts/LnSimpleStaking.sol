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


    function _calcReward( uint256 curBlock, address _user) internal view returns (uint256) {
        PoolInfo storage pool = mPoolInfo;
        UserInfo storage user = userInfo[_user];
        uint256 accRewardPerShare = pool.accRewardPerShare;
        uint256 lpSupply = pool.amount;
        if (curBlock > pool.lastRewardBlock && lpSupply != 0) {
            uint256 multiplier = curBlock.sub( pool.lastRewardBlock, "cr curBlock sub overflow" );
            uint256 curReward = multiplier.mul(rewardPerBlock);
            accRewardPerShare = accRewardPerShare.add(curReward.mul(1e20).div(lpSupply));
        }
        uint newReward = user.amount.mul(accRewardPerShare).div(1e20).sub(user.rewardDebt, "cr newReward sub overflow");
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

    function getUserInfo(address _user) public view returns(uint256,uint256,uint256) {
        return (userInfo[_user].reward, userInfo[_user].amount, userInfo[_user].rewardDebt);
    }

    function getPoolInfo() public view returns(uint256,uint256,uint256) {
        return (mPoolInfo.amount, mPoolInfo.lastRewardBlock, mPoolInfo.accRewardPerShare);
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
        uint256 multiplier = curBlock.sub( pool.lastRewardBlock, "_update curBlock sub overflow" );
        uint256 curReward = multiplier.mul(rewardPerBlock);
        
        remainReward = remainReward.add( curReward );
        accReward = accReward.add( curReward );

        pool.accRewardPerShare = pool.accRewardPerShare.add(curReward.mul(1e20).div(lpSupply));
        pool.lastRewardBlock = curBlock;
    }

    function _deposit( uint256 curBlock, address _addr, uint256 _amount) internal {
        PoolInfo storage pool = mPoolInfo;
        UserInfo storage user = userInfo[ _addr];
        _update( curBlock );
        if (user.amount > 0) {
            uint256 pending = user.amount.mul(pool.accRewardPerShare).div(1e20).sub(user.rewardDebt, "_deposit pending sub overflow");
            if(pending > 0) {
                reward( user, pending );
            }
        }
        if(_amount > 0) {
            user.amount = user.amount.add(_amount);
            pool.amount = pool.amount.add(_amount);
        }
        user.rewardDebt = user.amount.mul(pool.accRewardPerShare).div(1e20);
    }

    function _withdraw( uint256 curBlock, address _addr, uint256 _amount) internal {
        PoolInfo storage pool = mPoolInfo;
        UserInfo storage user = userInfo[_addr];
        require(user.amount >= _amount, "_withdraw: not good");
        _update( curBlock );
        uint256 pending = user.amount.mul(pool.accRewardPerShare).div(1e20).sub(user.rewardDebt, "_withdraw pending sub overflow");
        if(pending > 0) {
            reward( user, pending );
        }
        if(_amount > 0) {
            user.amount = user.amount.sub(_amount, "_withdraw user.amount sub overflow");
            pool.amount = pool.amount.sub(_amount, "_withdraw pool.amount sub overflow");
        }
        user.rewardDebt = user.amount.mul(pool.accRewardPerShare).div(1e20);
    }

    function reward( UserInfo storage user, uint256 _amount) internal {
        if (_amount > remainReward) {
            _amount = remainReward;
        }
        remainReward = remainReward.sub( _amount, "reward remainReward sub overflow");
        user.reward = user.reward.add( _amount );
    }

    function _claim( address _addr ) internal {
        UserInfo storage user = userInfo[_addr];
        if( user.reward > 0 )
        {
            user.reward = 0;
        }
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
    function calcReward( uint256 curBlock, address _user) public view returns (uint256) {
        return _calcReward( curBlock, _user);
    }

}


contract LnSimpleStaking is LnAdmin, Pausable, ILinearStaking, LnRewardCalculator {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    IERC20 public linaToken; // lina token proxy address
    LnLinearStakingStorage public stakingStorage;
    uint256 public mEndBlock;
    address public mOldStaking;
    uint256 public mOldAmount;
    uint256 public mWidthdrawRewardFromOldStaking;

    uint256 public claimRewardLockTime = 1620806400; // 2021-5-12

    mapping (address => uint ) public mOldReward;

    constructor(
        address _admin,
        address _linaToken,
        address _storage, uint256 _rewardPerBlock, uint256 _startBlock, uint256 _endBlock ) 
            public LnAdmin(_admin) LnRewardCalculator(_rewardPerBlock, _startBlock ){
        linaToken = IERC20(_linaToken);
        stakingStorage = LnLinearStakingStorage(_storage);
        mEndBlock = _endBlock;
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
        uint256 stakingBalance = super.amountOf(account).add( stakingStorage.stakingBalanceOf(account) );
        return stakingBalance;
    }

    function getStakesdataLength(address account) external view returns(uint256) {
        return stakingStorage.getStakesdataLength(account);
    }
    //--------------------------------------------------------

    function migrationsOldStaking( address contractAddr, uint amount, uint blockNb ) public onlyAdmin {
        super._deposit( blockNb, contractAddr, amount );
        mOldStaking = contractAddr;
        mOldAmount = amount;
    }


    function staking(uint256 amount) public whenNotPaused override returns (bool) {
        stakingStorage.requireInStakingPeriod();

        require(amount >= minStakingAmount, "Staking amount too small.");
        //require(stakingStorage.getStakesdataLength(msg.sender) < accountStakingListLimit, "Staking list out of limit.");

        linaToken.transferFrom(msg.sender, address(this), amount);
     
        uint256 blockNb = block.number;
        if (blockNb > mEndBlock) {
            blockNb = mEndBlock;
        }
        super._deposit( blockNb, msg.sender, amount );

        emit Staking(msg.sender, amount, block.timestamp);

        return true;
    }

    function _widthdrawFromOldStaking( address _addr, uint amount ) internal {
        uint256 blockNb = block.number;
        if (blockNb > mEndBlock) {
            blockNb = mEndBlock;
        }
        
        uint oldStakingAmount = super.amountOf( mOldStaking );
        super._withdraw( blockNb, mOldStaking, amount );
        // sub already withraw reward, then cal portion 
        uint reward = super.rewardOf( mOldStaking).sub( mWidthdrawRewardFromOldStaking, "_widthdrawFromOldStaking reward sub overflow" )
            .mul( amount ).mul(1e20).div( oldStakingAmount ).div(1e20);
        mWidthdrawRewardFromOldStaking = mWidthdrawRewardFromOldStaking.add( reward );
        mOldReward[ _addr ] = mOldReward[_addr].add( reward );
    }

    function _cancelStaking(address user, uint256 amount) internal {
        uint256 blockNb = block.number;
        if (blockNb > mEndBlock) {
            blockNb = mEndBlock;
        }

        uint256 returnAmount = amount;
        uint256 newAmount = super.amountOf(user);
        if (newAmount >= amount) {
            super._withdraw( blockNb, user, amount );
            amount = 0;
        } else {
            if (newAmount > 0) {
                super._withdraw( blockNb, user, newAmount );
                amount = amount.sub(newAmount, "_cancelStaking amount sub overflow");
            }
            
            for (uint256 i = stakingStorage.getStakesdataLength(user); i >= 1 ; i--) {
                (uint256 stakingAmount, uint256 staketime) = stakingStorage.getStakesDataByIndex(user, i-1);
                if (amount >= stakingAmount) {
                    amount = amount.sub(stakingAmount, "_cancelStaking amount sub overflow");
                    
                    stakingStorage.PopStakesData(user);
                    stakingStorage.SubWeeksTotal(staketime, stakingAmount);
                    _widthdrawFromOldStaking( user, stakingAmount );

                } else {
                    stakingStorage.StakingDataSub(user, i-1, amount);
                    stakingStorage.SubWeeksTotal(staketime, amount);
                    _widthdrawFromOldStaking( user, amount );

                    amount = 0;
                }
                if (amount == 0) break;
            }
        }

        // cancel as many as possible, not fail, that waste gas
        //require(amount == 0, "Cancel amount too big then staked.");
        
        linaToken.transfer(msg.sender, returnAmount.sub(amount));
    }

    function cancelStaking(uint256 amount) public whenNotPaused override returns (bool) {
        //stakingStorage.requireInStakingPeriod();

        require(amount > 0, "Invalid amount.");

        _cancelStaking(msg.sender, amount);

        emit CancelStaking(msg.sender, amount);

        return true;
    }

    function getTotalReward( uint blockNb, address _user ) public view returns ( uint256 total ){
        if( blockNb > mEndBlock ){
            blockNb = mEndBlock;
        }
        
        // 这里奖励分成了三部分
        // 1,已经从旧奖池中cancel了的
        // 2,还在旧奖池中的
        // 3，在新奖池中的
        total = mOldReward[ _user ];
        uint iMyOldStaking = 0;
        for (uint256 i=0; i < stakingStorage.getStakesdataLength( _user ); i++) {
            (uint256 stakingAmount, ) = stakingStorage.getStakesDataByIndex( _user, i);
            iMyOldStaking = iMyOldStaking.add( stakingAmount );
        }
        if( iMyOldStaking > 0 ){
            uint oldStakingAmount = super.amountOf( mOldStaking );
            uint iReward2 = super._calcReward( blockNb, mOldStaking).sub( mWidthdrawRewardFromOldStaking, "getTotalReward iReward2 sub overflow" )
                .mul( iMyOldStaking ).div( oldStakingAmount );
            total = total.add( iReward2 );
        }

        uint256 reward3 = super._calcReward( blockNb, _user );
        total = total.add( reward3 );
    }


    // claim reward
    // Note: 需要提前提前把奖励token转进来
    function claim() public whenNotPaused override returns (bool) {
        //stakingStorage.requireStakingEnd();
        require(block.timestamp > claimRewardLockTime, "Not time to claim reward");

        uint iMyOldStaking = stakingStorage.stakingBalanceOf( msg.sender );
        uint iAmount = super.amountOf( msg.sender );
        _cancelStaking( msg.sender, iMyOldStaking.add( iAmount ));

        uint iReward = getTotalReward( mEndBlock, msg.sender );

        _claim( msg.sender );
        mOldReward[ msg.sender ] = 0;
        linaToken.transfer(msg.sender, iReward );

        emit Claim(msg.sender, iReward, iMyOldStaking.add( iAmount ));
        return true;
    }

    function setRewardLockTime(uint256 newtime) public onlyAdmin {
        claimRewardLockTime = newtime;
    }

    function calcReward( uint256 curBlock, address _user) public view returns (uint256) {
        return _calcReward( curBlock, _user);
    }
}

contract HelperPushStakingData is LnAdmin {

    constructor(address _admin) public LnAdmin(_admin) {

    }

    function pushStakingData(address _storage, address[] calldata account, uint256[] calldata amount, uint256[] calldata staketime) external {
        require(account.length > 0, "array length zero");
        require(account.length == amount.length, "array length not eq");
        require(account.length == staketime.length, "array length not eq");

        LnLinearStakingStorage stakingStorage = LnLinearStakingStorage(_storage);
        for (uint256 i=0; i<account.length; i++) {
            stakingStorage.PushStakingData(account[i], amount[i], staketime[i]);
            stakingStorage.AddWeeksTotal(staketime[i], amount[i]);
        }
    }

    //unstaking.
}
