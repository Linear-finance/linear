// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// Reward Distributor
contract LnRewardLocker is LnAdmin {
    using SafeMath for uint256;

    struct RewardData{
        uint64 lockToTime;
        uint256 amount;
    }

    mapping (address => RewardData[]) public userRewards; // RewardData[0] is claimable
    mapping (address => uint256) public balanceOf;
    uint256 public totalNeedToReward;

    uint256 public constant maxRewardArrayLen = 100;

    address feeSysAddr;
    IERC20 public linaToken;

    constructor(address _admin, address linaAddress) public LnAdmin(_admin ) {
        linaToken = IERC20(linaAddress);
    }

    function setLinaAddress(address _token) external onlyAdmin {
        linaToken = IERC20(_token);
    }

    function Init(address _feeSysAddr) external onlyAdmin {
        feeSysAddr = _feeSysAddr;
    }

    modifier onlyFeeSys() {
        require( (msg.sender == feeSysAddr), "Only Fee System call");
        _;
    }

    function appendReward(address _user, uint256 _amount, uint64 _lockTo) external onlyFeeSys {
        if (userRewards[_user].length >= maxRewardArrayLen) {
            Slimming(_user);
        }

        require(userRewards[_user].length <= maxRewardArrayLen, "user array out of");
        // init cliamable
        if (userRewards[_user].length == 0) {
            RewardData memory data = RewardData( {
                lockToTime: 0,
                amount: 0
            });
            userRewards[_user].push(data);
        }
        
        // append new reward
        RewardData memory data = RewardData( {
            lockToTime: _lockTo,
            amount: _amount
        });
        userRewards[_user].push(data);

        balanceOf[_user] = balanceOf[_user].add(_amount);
        totalNeedToReward = totalNeedToReward.add(_amount);

        emit AppendReward(_user, _amount, _lockTo);
    }

    // move claimable to RewardData[0]
    function Slimming(address _user) public {
        require(userRewards[_user].length > 1, "not data to slimming");
        RewardData storage claimable = userRewards[_user][0];
        for (uint256 i=1; i<userRewards[_user].length; ) {
            if (now >= userRewards[_user][i].lockToTime) {
                claimable.amount = claimable.amount.add(userRewards[_user][i].amount);

                //swap last to current position
                uint256 len = userRewards[_user].length;
                userRewards[_user][i].lockToTime = userRewards[_user][len-1].lockToTime;
                userRewards[_user][i].amount = userRewards[_user][len-1].amount;
                userRewards[_user].pop();// delete last one
            } else {
                i++;
            }
        }
    }

    // if lock lina is collateral, claimable need calc to fix target ratio
    function ClaimMaxable() public {
        address user = msg.sender;
        Slimming(user);
        _claim(user, userRewards[user][0].amount);
    }

    function _claim(address _user, uint256 _amount) internal {
        userRewards[_user][0].amount = userRewards[_user][0].amount.sub(_amount);

        balanceOf[_user] = balanceOf[_user].sub(_amount);
        totalNeedToReward = totalNeedToReward.sub(_amount);
        
        linaToken.transfer(_user, _amount);
        emit ClaimLog(_user, _amount);
    }

    function Claim(uint256 _amount) public {
        address user = msg.sender;
        Slimming(user);
        require( _amount <= userRewards[user][0].amount, "Claim amount invalid");
        _claim(user, _amount);
    }

    event AppendReward(address user, uint256 amount, uint64 lockTo);
    event ClaimLog(address user, uint256 amount);
}

