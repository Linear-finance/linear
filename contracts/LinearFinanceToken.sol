pragma solidity ^0.5.17;

import "./IERC20.sol";
import "./LnTokenStorage.sol";
import "./LnErc20Handler.sol";

contract LinearFinance is IERC20, LnErc20Handler {
        
    string public constant TOKEN_NAME = "Linear Finance Token";
    string public constant TOKEN_SYMBOL = "LINA";
    uint8 public constant DECIMALS = 18;

    constructor(
        address payable _proxy,
        LnTokenStorage _tokenData,
        address _owner,
        uint _totalSupply
    )
        public
        LnErc20Handler(_proxy, _tokenData, TOKEN_NAME, TOKEN_SYMBOL, _totalSupply, DECIMALS, _owner)
    {
    }
    
    function _mint(address account, uint256 amount) private  {
        require(account != address(0), "ERC20: mint to the zero address");
        require(amount > 0, "Require amount > 0");

        tokenData.setBalanceOf(account, tokenData.balanceOf(account).add(amount));
        totalSupply = totalSupply.add(amount);

        emitTransfer(address(0), account, amount);
    }


    function mint(address account, uint256 amount) external onlyAdmin {
        _mint(account, amount);
    }


    ////////////////////////////////////////////////////// paused
    bool public paused = false;
    modifier notPaused {
        require(!paused, "This action cannot be performed while the contract is paused");
        _;
    }
    function setPaused(bool _paused) external onlyOwner {
        if (_paused == paused) {
            return;
        }
        paused = _paused;
        emit PauseChanged(paused);
    }

    //////////////////////////////////////////////////////
    event Staking(address indexed who, uint256 value, uint staketime);
    event CancelStaking(address indexed who, uint256 value);
    event Claim(address indexed who, uint256 stakeval, uint256 rewardval, uint256 sum);
    event PauseChanged(bool isPaused);

    struct StakingData {
        uint256 amount;
        uint staketime;
    }

    address linaToken;
    mapping (address => StakingData[]) private stakesdata;
    uint private stakingEndTime = 1596805918;
    uint private claimStartTime = stakingEndTime + 1 days;
    uint256 internal constant MIN_STAKING_AMOUNT = 1e18;

    uint256 public stakingRewardFactor = 1;
    uint256 public constant stakingRewardDenominator = 10000;

    uint256 public accountStakingListLimit = 50;

    function staking(uint256 amount) public notPaused returns (bool) {
        require(now < stakingEndTime, "Staking stage has end.");
        require(amount >= MIN_STAKING_AMOUNT, "Staking amount too small.");
        require(stakesdata[_msgSender()].length < accountStakingListLimit, "Staking list out of limit.");

        _burn(_msgSender(), amount);
     
        StakingData memory skaking = StakingData({
            amount: amount,
            staketime: now
        });
        stakesdata[_msgSender()].push(skaking);

        emit Staking(_msgSender(), amount, now);
        return true;
    }

    function cancelStaking(uint256 amount) public notPaused returns (bool) {
        require(now < stakingEndTime, "Staking stage has end.");
        require(amount > 0, "Invalid amount.");

        uint256 returnToken = amount;
        StakingData[] storage stakes = stakesdata[_msgSender()];
        for (uint256 i = stakes.length; i >= 1 ; i--) {
            StakingData storage lastElement = stakes[i-1];
            if (amount >= lastElement.amount) {
                amount = amount.sub(lastElement.amount);
                stakes.pop();
            } else {
                lastElement.amount = lastElement.amount.sub(amount);
                amount = 0;
            }
            if (amount == 0) break;
        }
        require(amount == 0, "Cancel amount too big then staked.");

        _mint(_msgSender(), returnToken);

        emit CancelStaking(_msgSender(), returnToken);
        return true;
    }

    function claim() public notPaused returns (bool) {
        require(now > claimStartTime, "Too early to claim");
        require(stakingRewardFactor > 0, "Need stakingRewardFactor > 0");
        
        uint256 total = 0;
        uint256 rewardSum = 0;
        StakingData[] memory stakes = stakesdata[_msgSender()];
        require(stakes.length > 0, "Nothing to claim");
        for (uint256 i=0; i < stakes.length; i++) {
            uint256 amount = stakes[i].amount;
            total = total.add(amount); // principal

            uint256 stakedays = (claimStartTime - stakes[i].staketime)/1 days;
            uint256 reward = amount.mul(stakedays).mul(stakingRewardFactor).div(stakingRewardDenominator);
            rewardSum = rewardSum.add(reward);
        }
        delete stakesdata[_msgSender()];

        uint256 tomint = total.add(rewardSum);
        _mint(_msgSender(), tomint);

        emit Claim(_msgSender(), total, rewardSum, tomint);
        return true;
    }

    function set_stakingRewardFactor(uint256 factor) external onlyOwner() {
        stakingRewardFactor = factor;
    }

    function rewardFactor() external view returns(uint256, uint256) {
        return (stakingRewardFactor, stakingRewardDenominator);
    }

    function set_StakingPeriod(uint stakingendtime, uint claimstarttime) external onlyOwner() {
        stakingEndTime = stakingendtime;
        claimStartTime = claimstarttime;
    }

    function stakingPeriod() external view returns(uint,uint) {
        return (stakingEndTime, claimStartTime);
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

/*
contract LinearFinanceEx is IERC20, LnErc20Handler {
        
    string public constant TOKEN_NAME = "Linear Finance Token";
    string public constant TOKEN_SYMBOL = "LINA";
    uint8 public constant DECIMALS = 18;

    constructor(
        address payable _proxy,
        LnTokenStorage _tokenData,
        address _owner,
        uint _totalSupply
    )
        public
        LnErc20Handler(_proxy, _tokenData, TOKEN_NAME, TOKEN_SYMBOL, _totalSupply, DECIMALS, _owner)
    {
    }
    
    function transfer(address to, uint value) external optionalProxy returns (bool) {
        _transferByProxy(messageSender, to, value);

        return true;
    }
    
    function transferFrom(
        address from,
        address to,
        uint value
    ) external optionalProxy  returns (bool) {
        return _transferFromByProxy(messageSender, from, to, value);
    }
    
}
*/
