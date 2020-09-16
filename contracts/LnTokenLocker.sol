// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./IERC20.sol";
import "./LnAdmin.sol";
import "./SafeDecimalMath.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Address.sol";

// approve
contract LnTokenLocker is LnAdmin, Pausable {
    using SafeMath for uint;

    IERC20 private token;
    struct LockInfo {
        uint256 amount;
        uint256 lockTimestamp; // lock time at block.timestamp
        uint256 lockDays;
        uint256 claimedAmount;
    }
    mapping (address => LockInfo) public lockData;
    
    constructor(address _token, address _admin) public LnAdmin(_admin) {
        token = IERC20(_token);
    }
    
    function sendLockTokenMany(address[] calldata _users, uint256[] calldata _amounts, uint256[] calldata _lockdays) external onlyAdmin {
        require(_users.length == _amounts.length, "array length not eq");
        require(_users.length == _lockdays.length, "array length not eq");
        for (uint256 i=0; i < _users.length; i++) {
            sendLockToken(_users[i], _amounts[i], _lockdays[i]);
        }
    }

    // 1. msg.sender/admin approve many token to this contract
    function sendLockToken(address _user, uint256 _amount, uint256 _lockdays) public onlyAdmin returns (bool) {
        require(_amount > 0, "amount can not zero");
        require(lockData[_user].amount == 0, "this address has locked");
        require(_lockdays > 0, "lock days need more than zero");
        
        LockInfo memory lockinfo = LockInfo({
            amount:_amount,
            lockTimestamp:block.timestamp,
            lockDays:_lockdays,
            claimedAmount:0
        });

        lockData[_user] = lockinfo;
        return true;
    }
    
    function claimToken(uint256 _amount) external returns (uint256) {
        require(_amount > 0, "Invalid parameter amount");
        address _user = msg.sender;
        require(lockData[_user].amount > 0, "No lock token to claim");

        uint256 passdays = block.timestamp.sub(lockData[_user].lockTimestamp).div(1 days);
        require(passdays > 0, "need wait for one day at least");

        uint256 available = 0;
        if (passdays >= lockData[_user].lockDays) {
            available = lockData[_user].amount;
        } else {
            available = lockData[_user].amount.div(lockData[_user].lockDays).mul(passdays);
        }
        available = available.sub(lockData[_user].claimedAmount);
        require(available > 0, "not available claim");
        //require(_amount <= available, "insufficient available");
        uint256 claim = _amount;
        if (_amount > available) { // claim as much as possible
            claim = available;
        }

        lockData[_user].claimedAmount = lockData[_user].claimedAmount.add(claim);

        token.transfer(_user, claim);

        return claim;
    }
}



contract LnTokenCliffLocker is LnAdmin, Pausable {
    using SafeMath for uint;

    IERC20 private token;
    struct LockInfo {
        uint256 amount;
        uint256 lockTimestamp; // lock time at block.timestamp
        uint256 claimedAmount;
    }
    mapping (address => LockInfo) public lockData;
    
    constructor(address _token, address _admin) public LnAdmin(_admin) {
        token = IERC20(_token);
    }
    
    function sendLockTokenMany(address[] calldata _users, uint256[] calldata _amounts, uint256[] calldata _lockdays) external onlyAdmin {
        require(_users.length == _amounts.length, "array length not eq");
        require(_users.length == _lockdays.length, "array length not eq");
        for (uint256 i=0; i < _users.length; i++) {
            sendLockToken(_users[i], _amounts[i], _lockdays[i]);
        }
    }

    function avaible( ) external view returns( uint256 ){
        address _user = msg.sender;
        require(lockData[_user].amount > 0, "No lock token to claim");

        uint256 available = 0;
        available = lockData[_user].amount;
        available = available.sub(lockData[_user].claimedAmount);
        return available;
    }

    // 1. msg.sender/admin approve many token to this contract
    function sendLockToken(address _user, uint256 _amount, uint256 _locktimes ) public onlyAdmin returns (bool) {
        require(_amount > 0, "amount can not zero");
        require(lockData[_user].amount == 0, "this address has locked");
        require(_locktimes > 0, "lock days need more than zero");
        
        LockInfo memory lockinfo = LockInfo({
            amount:_amount,
            lockTimestamp:_locktimes,
            claimedAmount:0
        });

        lockData[_user] = lockinfo;
        return true;
    }
    
    function claimToken(uint256 _amount) external returns (uint256) {
        require(_amount > 0, "Invalid parameter amount");
        address _user = msg.sender;
        require(lockData[_user].amount > 0, "No lock token to claim");

        uint256 available = 0;
        available = lockData[_user].amount;
        available = available.sub(lockData[_user].claimedAmount);
        require(available > 0, "not available claim");

        uint256 claim = _amount;
        if (_amount > available) { // claim as much as possible
            claim = available;
        }

        lockData[_user].claimedAmount = lockData[_user].claimedAmount.add(claim);

        token.transfer(_user, claim);

        return claim;
    }
}

