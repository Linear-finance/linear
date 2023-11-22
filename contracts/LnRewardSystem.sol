// SPDX-License-Identifier: MIT
pragma solidity ^0.7.6;
pragma abicoder v2;

import "@openzeppelin/contracts-upgradeable/cryptography/ECDSAUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/math/SafeMathUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "./interfaces/ILnCollateralSystem.sol";
import "./interfaces/ILnRewardLocker.sol";
import "./upgradeable/LnAdminUpgradeable.sol";
import "hardhat/console.sol";

/**
 * @title LnRewardSystem
 *
 * @dev A contract for distributing staking rewards and exchange fees based on
 * amounts calculated and signed off-chain.
 *
 * This contract only performs basic signature validation and re-entrance prevention
 * to minimize the cost of claming rewards.
 *
 * Period ID starts from 1, not zero.
 */
contract LnRewardSystem is LnAdminUpgradeable {
    using ECDSAUpgradeable for bytes32;
    using SafeMathUpgradeable for uint256;

    event RewardSignersChanged(address[] newSigners);
    event RewardLockerAddressChanged(address oldAddress, address newAddress);
    event RewardClaimed(address recipient, uint256 periodId, uint256 stakingReward, uint256 feeReward);

    event PeriodLengthUpdated(uint256 oldPeriodLength, uint256 newPeriodLength);
    event ClaimWindowPeriodCountUpdated(uint256 oldClaimWindowPeriodCount, uint256 newClaimWindowPeriodCount);
    event StakingRewardLockPeriodUpdated(uint256 oldStakingRewardLockPeriod, uint256 newStakingRewardLockPeriod);
    
    uint256 public firstPeriodStartTime;

    // This is a storage slot that used to be called `rewardSigner` when only one signer was used.
    // It's now replaced by `rewardSigners`. The slot is kept to not break storage structure but
    // it's no longer needed for the contract.
    address private DEPRECATED_DO_NOT_USE;

    mapping(address => uint256) public userLastClaimPeriodIds;

    IERC20Upgradeable public lusd;
    ILnCollateralSystem public collateralSystem;
    ILnRewardLocker public rewardLocker;

    bytes32 public DOMAIN_SEPARATOR; // For EIP-712

    address[] public rewardSigners;

    /* EIP-712 type hashes */
    bytes32 public constant REWARD_TYPEHASH =
        keccak256("Reward(uint256 periodId,address recipient,uint256 stakingReward,uint256 feeReward)");

    uint256 public periodLength;//= 1 weeks;
    uint256 public claimWindowPeriodCount;// = 2;
    uint256 public stakingRewardLockPeriod;// = 52 weeks;

    function getSignerCount() public view returns (uint256) {
        return rewardSigners.length;
    }

    function getCurrentPeriodId() public view returns (uint256) {
        require(block.timestamp >= firstPeriodStartTime, "LnRewardSystem: first period not started");
        return (block.timestamp - firstPeriodStartTime) / periodLength + 1; // No SafeMath needed
    }

    function getPeriodStartTime(uint256 periodId) public view returns (uint256) {
        require(periodId > 0, "LnRewardSystem: period ID must be positive");
        return firstPeriodStartTime.add(periodId.sub(1).mul(periodLength));
    } 

    function getPeriodEndTime(uint256 periodId) public view returns (uint256) {
        require(periodId > 0, "LnRewardSystem: period ID must be positive");
        return firstPeriodStartTime.add(periodId.mul(periodLength));
    }

    function __LnRewardSystem_init(
        uint256 _firstPeriodStartTime,
        address[] calldata _rewardSigners,
        address _lusdAddress,
        address _collateralSystemAddress,
        address _rewardLockerAddress,
        address _admin,
        uint256 _periodLength,
        uint256 _claimWindowPeriodCount,
        uint256 _stakingRewardLockPeriod
    ) public initializer {
        __LnAdminUpgradeable_init(_admin);

        /**
         * The next line is commented out to make migration from Ethereum to Binance Smart
         * chain possible.
         */
        // require(block.timestamp < _firstPeriodStartTime + PERIOD_LENGTH, "LnRewardSystem: first period already ended");

        firstPeriodStartTime = _firstPeriodStartTime;

        _setRewardSigners(_rewardSigners);
        _SetClaimWindowPeriodCount(_claimWindowPeriodCount);
        _SetStakingRewardLockPeriod(_stakingRewardLockPeriod);
        _SetPeriodLength(_periodLength);

        require(
            _lusdAddress != address(0) && _collateralSystemAddress != address(0) && _rewardLockerAddress != address(0), 
            "LnRewardSystem: zero address"
        );
        
        lusd = IERC20Upgradeable(_lusdAddress);
        collateralSystem = ILnCollateralSystem(_collateralSystemAddress);
        rewardLocker = ILnRewardLocker(_rewardLockerAddress);

        // While we could in-theory calculate the EIP-712 domain separator off-chain, doing
        // it on-chain simplifies deployment and the cost here is one-off and acceptable.
        uint256 chainId;
        assembly {
            chainId := chainid()
        }
        DOMAIN_SEPARATOR = keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes("Linear")),
                keccak256(bytes("1")),
                chainId,
                address(this)
            )
        );
    }

    function SetPeriodLength(uint256 length) external onlyAdmin {
        _SetPeriodLength(length);
    }  

    function SetClaimWindowPeriodCount(uint256 count) external onlyAdmin {
        _SetClaimWindowPeriodCount(count);
    }  
    
    function SetStakingRewardLockPeriod(uint256 length) external onlyAdmin {
        _SetStakingRewardLockPeriod(length);
    }  

    function SetLusdTokenAddress(address _address) external onlyAdmin {
        _setLusdTokenAddress(_address);
    }  

    function setRewardSigners(address[] calldata _rewardSigners) external onlyAdmin {
        _setRewardSigners(_rewardSigners);
    }

    function setRewardLockerAddress(address _rewardLockerAddress) external onlyAdmin {
        _setRewardLockerAddress(_rewardLockerAddress);
    }

    function claimReward(
        uint256 periodId,
        uint256 stakingReward,
        uint256 feeReward,
        bytes[] calldata signatures
    ) external {
        _claimReward(periodId, msg.sender, stakingReward, feeReward, signatures);
    }

    function claimRewardFor(
        uint256 periodId,
        address recipient,
        uint256 stakingReward,
        uint256 feeReward,
        bytes[] calldata signatures
    ) external {
        _claimReward(periodId, recipient, stakingReward, feeReward, signatures);
    }

    function _setLusdTokenAddress(address _lusdAddress) private {        
        require(_lusdAddress != address(0), "IERC20Upgradeable: zero address");
        require(_lusdAddress != address(lusd), "IERC20Upgradeable: address not changed");
        address oldAddress = address(lusd); 
        lusd = IERC20Upgradeable(_lusdAddress);        
    }

    function _SetStakingRewardLockPeriod(uint256 _stakingRewardLockPeriod) private 
    {        
        require(_stakingRewardLockPeriod != 0, "Cannot be 0");
        require(_stakingRewardLockPeriod != stakingRewardLockPeriod, "Value has not changed");
        uint256 oldStakingRewardLockPeriod = stakingRewardLockPeriod; 
        stakingRewardLockPeriod = _stakingRewardLockPeriod;  
        emit StakingRewardLockPeriodUpdated(stakingRewardLockPeriod, oldStakingRewardLockPeriod);
    }

    function _SetClaimWindowPeriodCount(uint256 _claimWindowPeriodCount) private 
    {        
        require(_claimWindowPeriodCount != 0, "Cannot be 0");
        require(_claimWindowPeriodCount != claimWindowPeriodCount, "Value has not changed");
        uint256 oldClaimWindowPeriodCount = claimWindowPeriodCount; 
        claimWindowPeriodCount = _claimWindowPeriodCount;  
        emit ClaimWindowPeriodCountUpdated(claimWindowPeriodCount, oldClaimWindowPeriodCount);
    }

    function _SetPeriodLength(uint256 _periodLength) private 
    {        
        require(_periodLength != 0, "Cannot be 0");
        require(_periodLength != periodLength, "Value has not changed");
        uint256 oldPeriodLength = periodLength; 
        periodLength = _periodLength;  
        emit PeriodLengthUpdated(periodLength, oldPeriodLength);
    }

    function _setRewardSigners(address[] calldata _rewardSigners) private {
        // We free up this slot so that we can reuse it in the next upgrade
        DEPRECATED_DO_NOT_USE = address(0);

        require(_rewardSigners.length > 1, "LnRewardSystem: at least 2 signers");

        require(_rewardSigners[0] != address(0), "LnRewardSystem: zero address");

        // We technically don't need this ordering enforced but this would be helpful if we
        // implement quorum in the future. Plus we need to check zero address anyways.
        for (uint256 ind = 1; ind < _rewardSigners.length; ind++) {
            require(_rewardSigners[ind] > _rewardSigners[ind - 1], "LnRewardSystem: invalid signer order");
        }

        if (rewardSigners.length > 0) {
            uint256 deleteCount = rewardSigners.length;
            for (uint256 ind = 0; ind < deleteCount; ind++) {
                rewardSigners.pop();
            }
        }

        for (uint256 ind = 0; ind < _rewardSigners.length; ind++) {
            rewardSigners.push(_rewardSigners[ind]);
        }

        emit RewardSignersChanged(_rewardSigners);
    }

    function _setRewardLockerAddress(address _rewardLockerAddress) private {
        require(_rewardLockerAddress != address(0), "LnRewardSystem: zero address");
        require(_rewardLockerAddress != address(rewardLocker), "LnRewardSystem: address not changed");

        address oldAddress = address(rewardLocker);
        rewardLocker = ILnRewardLocker(_rewardLockerAddress);

        emit RewardLockerAddressChanged(oldAddress, address(rewardLocker));
    }

    function _claimReward(
        uint256 periodId,
        address recipient,
        uint256 stakingReward,
        uint256 feeReward,
        bytes[] calldata signatures
    ) private {
        require(periodId > 0, "LnRewardSystem: period ID must be positive");
        require(stakingReward > 0 || feeReward > 0, "LnRewardSystem: nothing to claim");

        // Check if the target period is in the claiming window
        uint256 currentPeriodId = getCurrentPeriodId();
        require(periodId < currentPeriodId, "LnRewardSystem: period not ended");
        require(
            currentPeriodId <= claimWindowPeriodCount || periodId >= currentPeriodId - claimWindowPeriodCount,
            "LnRewardSystem: reward expired"
        );

        // Re-entrance prevention
        require(userLastClaimPeriodIds[recipient] < periodId, "LnRewardSystem: reward already claimed");
        userLastClaimPeriodIds[recipient] = periodId;

        // Users can only claim rewards if target ratio is satisfied
        require(collateralSystem.IsSatisfyTargetRatio(recipient), "LnRewardSystem: below target ratio");

        // Verify EIP-712 signature
        require(rewardSigners.length > 0, "LnRewardSystem: empty signer set");
        require(signatures.length == rewardSigners.length, "LnRewardSystem: signature count mismatch");
        bytes32 digest =
            keccak256(
                abi.encodePacked(
                    "\x19\x01",
                    DOMAIN_SEPARATOR,
                    keccak256(abi.encode(REWARD_TYPEHASH, periodId, recipient, stakingReward, feeReward))
                )
            );
            
        for (uint256 ind; ind < signatures.length; ind++) {
            address recoveredAddress = digest.recover(signatures[ind]);
            require(recoveredAddress == rewardSigners[ind], "LnRewardSystem: invalid signature");
        }

        if (stakingReward > 0) {
            rewardLocker.addReward(recipient, stakingReward, getPeriodEndTime(periodId) + stakingRewardLockPeriod);
        }

        if (feeReward > 0) {
            lusd.transfer(recipient, feeReward);
        }

        emit RewardClaimed(recipient, periodId, stakingReward, feeReward);
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[42] private __gap;
}
