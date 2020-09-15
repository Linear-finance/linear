// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnTokenStorage.sol";
import "./LnErc20Handler.sol";

contract LinearFinance is LnErc20Handler {
    
    string public constant TOKEN_NAME = "Linear Finance Token";
    string public constant TOKEN_SYMBOL = "LINA";
    uint8 public constant DECIMALS = 18;

    constructor(
        address payable _proxy,
        LnTokenStorage _tokenStorage,
        address _admin,
        uint _totalSupply
    )
        public
        LnErc20Handler(_proxy, _tokenStorage, TOKEN_NAME, TOKEN_SYMBOL, _totalSupply, DECIMALS, _admin)
    {
    }
    
    //
    function _mint(address account, uint256 amount) private  {
        require(account != address(0), "ERC20: mint to the zero address");
        _beforeTokenTransfer(address(0), account, amount);

        tokenStorage.setBalanceOf(account, tokenStorage.balanceOf(account).add(amount));
        totalSupply = totalSupply.add(amount);

        emitTransfer(address(0), account, amount);
    }

    function mint(address account, uint256 amount) external onlyAdmin {
        _mint(account, amount);
    }

   function _burn(address account, uint256 amount) private {
        require(account != address(0), "ERC20: burn from the zero address");
        _beforeTokenTransfer(account, address(0), amount);

        tokenStorage.setBalanceOf(account, tokenStorage.balanceOf(account).sub(amount));
        totalSupply = totalSupply.sub(amount);
        emitTransfer(account, address(0), amount);
    }

    function _beforeTokenTransfer(address from, address to, uint256 amount) internal override {
        super._beforeTokenTransfer(from, to, amount);

        require(!paused, "ERC20Pausable: token transfer while paused");
    }

    ////////////////////////////////////////////////////// paused
    bool public paused = false;
    modifier notPaused {
        require(!paused, "This action cannot be performed while the contract is paused");
        _;
    }
    function setPaused(bool _paused) external onlyAdmin {
        if (_paused == paused) {
            return;
        }
        paused = _paused;
        emit PauseChanged(paused);
    }

    //////////////////////////////////////////////////////
    event Staking(address indexed who, uint256 value, uint staketime);
    event CancelStaking(address indexed who, uint256 value);
    event Claim(address indexed who, uint256 rewardval, uint256 totalStaking);
    event PauseChanged(bool isPaused);

    struct StakingData {
        uint256 amount;
        uint staketime;
    }

    mapping (address => StakingData[]) public stakesdata;
    uint256 public accountStakingListLimit = 50;

    uint public stakingStartTime = 1600329600; // TODO: UTC or UTC+8
    uint public stakingEndTime = 1605168000;
    uint256 public minStakingAmount = 1e18; // 1 token

    uint256 public constant PRECISION_UINT = 1e18;
    uint256 public weekRewardAmount = 18750000e18;

    // days weeks
    mapping (uint256 => uint256) public weeksTotal; // week staking amount

    function weekTotalStaking() public view returns (uint256[] memory) {
        uint256 totalWeekNumber = stakingEndTime.sub(stakingStartTime) / 1 weeks;
        if (stakingEndTime.sub(stakingStartTime) % 1 weeks != 0) {
            totalWeekNumber = totalWeekNumber.add(1);
        }
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

    function staking(uint256 amount) public notPaused returns (bool) {
        require(stakingStartTime < block.timestamp, "Staking not start");
        require(block.timestamp < stakingEndTime, "Staking stage has end.");

        require(amount >= minStakingAmount, "Staking amount too small.");
        require(stakesdata[msg.sender].length < accountStakingListLimit, "Staking list out of limit.");

        _burn(msg.sender, amount);
     
        StakingData memory skaking = StakingData({
            amount: amount,
            staketime: block.timestamp
        });
        stakesdata[msg.sender].push(skaking);

        emit Staking(msg.sender, amount, block.timestamp);

        uint256 weekNumber = block.timestamp.sub(stakingStartTime) / 1 weeks;
        weeksTotal[weekNumber] = weeksTotal[weekNumber].add(amount);
        return true;
    }

    function cancelStaking(uint256 amount) public notPaused returns (bool) {
        require(stakingStartTime < block.timestamp, "Staking not start");
        require(block.timestamp < stakingEndTime, "Staking stage has end.");

        require(amount > 0, "Invalid amount.");

        uint256 returnToken = amount;
        StakingData[] storage stakes = stakesdata[msg.sender];
        for (uint256 i = stakes.length; i >= 1 ; i--) {
            StakingData storage lastElement = stakes[i-1];
            if (amount >= lastElement.amount) {
                amount = amount.sub(lastElement.amount);
                
                uint256 wn = lastElement.staketime.sub(stakingStartTime) / 1 weeks;
                weeksTotal[wn] = weeksTotal[wn].sub(lastElement.amount);

                stakes.pop();
            } else {
                lastElement.amount = lastElement.amount.sub(amount);

                uint256 wn = lastElement.staketime.sub(stakingStartTime) / 1 weeks;
                weeksTotal[wn] = weeksTotal[wn].sub(amount);

                amount = 0;
            }
            if (amount == 0) break;
        }
        require(amount == 0, "Cancel amount too big then staked.");

        _mint(msg.sender, returnToken);

        emit CancelStaking(msg.sender, returnToken);

        return true;
    }

    // claim reward
    function claim() public notPaused returns (bool) {
        //require(stakingStartTime < block.timestamp, "Staking not start");
        require(block.timestamp > stakingEndTime, "Need wait to staking end");

        StakingData[] memory stakes = stakesdata[msg.sender];
        require(stakes.length > 0, "Nothing to claim");

        uint256 claimtime = stakingEndTime;
        uint256 totalWeekNumber = claimtime.sub(stakingStartTime) / 1 weeks;
        if (claimtime.sub(stakingStartTime) % 1 weeks != 0) {
            totalWeekNumber = totalWeekNumber.add(1);
        }

        uint256 totalStaking = 0;
        uint256 totalReward = 0;

        uint256[] memory finalTotals = weekTotalStaking();
        for (uint256 i=0; i < stakes.length; i++) {
            uint256 stakedWeedNumber = stakes[i].staketime.sub(stakingStartTime) / 1 weeks;

            totalStaking = totalStaking.add(stakes[i].amount);
            
            uint256 reward = 0;
            for (uint256 j=stakedWeedNumber; j < totalWeekNumber; j++) {
                reward = reward.add( stakes[i].amount.mul(PRECISION_UINT).div(finalTotals[j]) ); //move .mul(weekRewardAmount) to next line.
            }
            reward = reward.mul(weekRewardAmount).div(PRECISION_UINT);

            totalReward = totalReward.add( reward );
        }

        delete stakesdata[msg.sender];        
        _mint(msg.sender, totalStaking.add(totalReward) );

        emit Claim(msg.sender, totalReward, totalStaking);
        return true;
    }

    function setMinStakingAmount(uint256 _minStakingAmount) external onlyAdmin {
        minStakingAmount = _minStakingAmount;
    }

    function setWeekRewardAmount(uint256 _weekRewardAmount) external onlyAdmin {
        weekRewardAmount = _weekRewardAmount;
    }

    function setStakingPeriod(uint _stakingStartTime, uint _stakingEndTime) external onlyAdmin {
        require(_stakingEndTime > _stakingStartTime);

        stakingStartTime = _stakingStartTime;
        stakingEndTime = _stakingEndTime;
    }

    function stakingBalanceOf(address account) external view returns(uint256) {
        uint256 total = 0;
        StakingData[] memory stakes = stakesdata[account];
        for (uint256 i=0; i < stakes.length; i++) {
            total = total.add(stakes[i].amount);
        }
        return total;
    }
}
