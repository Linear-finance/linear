// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "./LnAccessControl.sol";

interface ILinearStaking {
    function staking(uint256 amount) external returns (bool);
    function cancelStaking(uint256 amount) external returns (bool);
    function claim() external returns (bool);
    function stakingBalanceOf(address account) external view returns(uint256);
}

contract LnLinearStakingStorage is LnAdmin {
    using SafeMath for uint256;

    LnAccessControl public accessCtrl;

    bytes32 public constant DATA_ACCESS_ROLE = "LinearStakingStorage";

    struct StakingData {
        uint256 amount;
        uint256 staketime;
    }

    mapping (address => StakingData[]) public stakesdata;
    mapping (uint256 => uint256) public weeksTotal; // week staking amount

    uint256 public stakingStartTime = 1600329600; // TODO: UTC or UTC+8
    uint256 public stakingEndTime = 1605168000;
    uint256 public totalWeekNumber = 8;
    uint256 public weekRewardAmount = 18750000e18;

    constructor(address _admin, address _accessCtrl) public LnAdmin(_admin) {
        accessCtrl = LnAccessControl(_accessCtrl);
    }

    modifier OnlyLinearStakingStorageRole(address _address) {
        require(accessCtrl.hasRole(DATA_ACCESS_ROLE, _address), "Only Linear Staking Storage Role");
        _;
    }

    function setAccessControl(address _accessCtrl) external onlyAdmin {
        accessCtrl = LnAccessControl(_accessCtrl);
    }

    function weekTotalStaking() public view returns (uint256[] memory) {
        uint256[] memory totals = new uint256[](totalWeekNumber);
        for (uint256 i=0; i< totalWeekNumber; i++) {
            uint256 delta = weeksTotal[i];
            if (i == 0) {
                totals[i] = delta;
            } else {
                
                totals[i] = totals[i-1].add(delta);
            }
        }
        return totals;
    }

    function getStakesdataLength(address account) external view returns(uint256) {
        return stakesdata[account].length;
    }

    function getStakesDataByIndex(address account, uint256 index) external view returns(uint256, uint256) {
        return (stakesdata[account][index].amount, stakesdata[account][index].staketime);
    }

    function stakingBalanceOf(address account) external view returns(uint256) {
        uint256 total = 0;
        StakingData[] memory stakes = stakesdata[account];
        for (uint256 i=0; i < stakes.length; i++) {
            total = total.add(stakes[i].amount);
        }
        return total;
    }

    function requireInStakingPeriod() external view {
        require(stakingStartTime < block.timestamp, "Staking not start");
        require(block.timestamp < stakingEndTime, "Staking stage has end.");
    }

    function requireStakingEnd() external view {
        require(block.timestamp > stakingEndTime, "Need wait to staking end");
    }

    function PushStakingData(address account, uint256 amount, uint256 staketime) external OnlyLinearStakingStorageRole(msg.sender) {
        LnLinearStakingStorage.StakingData memory data = LnLinearStakingStorage.StakingData({
            amount: amount,
            staketime: staketime
        });
        stakesdata[account].push(data);
    }

    function StakingDataAdd(address account, uint256 index, uint256 amount) external OnlyLinearStakingStorageRole(msg.sender) {
        stakesdata[account][index].amount = stakesdata[account][index].amount.add(amount);
    }

    function StakingDataSub(address account, uint256 index, uint256 amount) external OnlyLinearStakingStorageRole(msg.sender) {
        stakesdata[account][index].amount = stakesdata[account][index].amount.sub(amount, "StakingDataSub sub overflow");
    }

    function DeleteStakesData(address account) external OnlyLinearStakingStorageRole(msg.sender) {
        delete stakesdata[account];
    }

    function PopStakesData(address account) external OnlyLinearStakingStorageRole(msg.sender) {
        stakesdata[account].pop();
    }

    function AddWeeksTotal(uint256 staketime, uint256 amount) external OnlyLinearStakingStorageRole(msg.sender) {
        uint256 weekNumber = staketime.sub(stakingStartTime, "AddWeeksTotal sub overflow") / 1 weeks;
        weeksTotal[weekNumber] = weeksTotal[weekNumber].add(amount);
    }

    function SubWeeksTotal(uint256 staketime, uint256 amount) external OnlyLinearStakingStorageRole(msg.sender) {
        uint256 weekNumber = staketime.sub(stakingStartTime, "SubWeeksTotal weekNumber sub overflow") / 1 weeks;
        weeksTotal[weekNumber] = weeksTotal[weekNumber].sub(amount, "SubWeeksTotal weeksTotal sub overflow");
    }

    function setWeekRewardAmount(uint256 _weekRewardAmount) external onlyAdmin {
        weekRewardAmount = _weekRewardAmount;
    }

    function setStakingPeriod(uint _stakingStartTime, uint _stakingEndTime) external onlyAdmin {
        require(_stakingEndTime > _stakingStartTime);

        stakingStartTime = _stakingStartTime;
        stakingEndTime = _stakingEndTime;

        totalWeekNumber = stakingEndTime.sub(stakingStartTime, "setStakingPeriod totalWeekNumber sub overflow") / 1 weeks;
        if (stakingEndTime.sub(stakingStartTime, "setStakingPeriod stakingEndTime sub overflow") % 1 weeks != 0) {
            totalWeekNumber = totalWeekNumber.add(1);
        }
    }
}

contract LnLinearStaking is LnAdmin, Pausable, ILinearStaking {
    using SafeMath for uint256;

    IERC20 public linaToken; // lina token proxy address
    LnLinearStakingStorage public stakingStorage;
    
    constructor(
        address _admin,
        address _linaToken,
        address _storage
    ) public LnAdmin(_admin) {
        linaToken = IERC20(_linaToken);
        stakingStorage = LnLinearStakingStorage(_storage);
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
                amount = amount.sub(stakingAmount, "cancelStaking sub overflow");
                
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

        emit CancelStaking(msg.sender, returnToken);

        return true;
    }

    // claim reward
    // Note: 需要提前提前把奖励token转进来
    function claim() public whenNotPaused override returns (bool) {
        stakingStorage.requireStakingEnd();

        require(stakingStorage.getStakesdataLength(msg.sender) > 0, "Nothing to claim");

        uint256 totalWeekNumber = stakingStorage.totalWeekNumber();

        uint256 totalStaking = 0;
        uint256 totalReward = 0;

        uint256[] memory finalTotals = stakingStorage.weekTotalStaking();
        for (uint256 i=0; i < stakingStorage.getStakesdataLength(msg.sender); i++) {
            (uint256 stakingAmount, uint256 staketime) = stakingStorage.getStakesDataByIndex(msg.sender, i);
            uint256 stakedWeedNumber = staketime.sub(stakingStorage.stakingStartTime(), "claim sub overflow") / 1 weeks;

            totalStaking = totalStaking.add(stakingAmount);
            
            uint256 reward = 0;
            for (uint256 j=stakedWeedNumber; j < totalWeekNumber; j++) {
                reward = reward.add( stakingAmount.mul(PRECISION_UINT).div(finalTotals[j]) ); //move .mul(weekRewardAmount) to next line.
            }
            reward = reward.mul(stakingStorage.weekRewardAmount()).div(PRECISION_UINT);

            totalReward = totalReward.add( reward );
        }

        stakingStorage.DeleteStakesData(msg.sender);
        
        //linaToken.mint(msg.sender, totalStaking.add(totalReward) );
        linaToken.transfer(msg.sender, totalStaking.add(totalReward) );

        emit Claim(msg.sender, totalReward, totalStaking);
        return true;
    }
}