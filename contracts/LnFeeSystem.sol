// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./LnAdmin.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./LnAddressCache.sol";
import "./LnDebtSystem.sol";
import "./LnCollateralSystem.sol";
import "./LnRewardLocker.sol";

contract LnFeeSystem is LnAdmin, LnAddressCache {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    address public constant FEE_DUMMY_ADDRESS = address(0x2048); 

    struct DebtData {
        uint256 debtProportion;
        uint256 debtFactor; // PRECISE_UNIT
    }

    struct RewardPeriod {
        uint256 id;
        uint256 startingDebtFactor;
        uint256 startTime;
        uint256 feesToDistribute; // 要分配的费用
        uint256 feesClaimed; // 已领取的费用
        uint256 rewardsToDistribute; // 要分配的奖励
        uint256 rewardsClaimed; // 已领取的奖励
    }

    RewardPeriod public curRewardPeriod;
    RewardPeriod public preRewardPeriod;
    uint256 public OnePeriodSecs = 1 weeks;

    mapping (address => uint256) public userLastClaimedId;

    //
    LnDebtSystem public debtSystem;
    LnCollateralSystem public collateralSystem;
    LnRewardLocker public rewardLocker;

    address public exchangeSystemAddress;
    address public rewardDistributer;

    constructor(address _admin ) public LnAdmin(_admin ) {
    }

    function Init(address _exchangeSystem, address _rewardDistri) public onlyAdmin {
        exchangeSystemAddress = _exchangeSystem;
        rewardDistributer = _rewardDistri;
    }

    function setExchangeSystemAddress(address _address) public onlyAdmin {
        exchangeSystemAddress = _address;
    }

    modifier onlyExchanger {
        require( (msg.sender == exchangeSystemAddress), "Only Exchange System call");
        _;
    }

    modifier onlyDistributer {
        require( (msg.sender == rewardDistributer), "Only Reward Distributer call");
        _;
    }

    function addExchangeFee( uint feeUsd ) public onlyExchanger {
        curRewardPeriod.feesToDistribute = curRewardPeriod.feesToDistribute.add(feeUsd);
        emit ExchangeFee( feeUsd );
    }

    // TODO: call by contract or auto distribute?
    function addCollateralRewards( uint reward) public onlyDistributer {
        curRewardPeriod.rewardsToDistribute = curRewardPeriod.rewardsToDistribute.add(reward);
        emit RewardCollateral(reward);
    }

    event ExchangeFee( uint feeUsd );
    event RewardCollateral( uint reward );

    // Note: before start run need call this func to init.
    function Init() public {
        switchPeriod();
    }

    function updateAddressCache( LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        debtSystem =      LnDebtSystem(     _addressStorage.getAddressWithRequire( "LnDebtSystem",      "LnDebtSystem address not valid" ));
        address payable collateralAddress = payable(_addressStorage.getAddressWithRequire( "LnCollateralSystem","LnCollateralSystem address not valid" ));
        collateralSystem = LnCollateralSystem( collateralAddress );
        rewardLocker =   LnRewardLocker(     _addressStorage.getAddressWithRequire( "LnRewardLocker",      "LnRewardLocker address not valid" ));

        emit updateCachedAddress( "LnDebtSystem",      address(debtSystem) );
        emit updateCachedAddress( "LnCollateralSystem",address(collateralSystem) );
        emit updateCachedAddress( "LnRewardLocker",address(rewardLocker) );
     }

    function switchPeriod() public {
        require(now >= curRewardPeriod.startTime + OnePeriodSecs, "It's not time to switch");

        preRewardPeriod.id = curRewardPeriod.id;
        preRewardPeriod.startingDebtFactor = curRewardPeriod.startingDebtFactor;
        preRewardPeriod.startTime = curRewardPeriod.startTime;
        preRewardPeriod.feesToDistribute = curRewardPeriod.feesToDistribute.add( preRewardPeriod.feesToDistribute.sub(preRewardPeriod.feesClaimed) );
        preRewardPeriod.feesClaimed = 0;
        preRewardPeriod.rewardsToDistribute = curRewardPeriod.rewardsToDistribute.add( preRewardPeriod.rewardsToDistribute.sub(preRewardPeriod.rewardsClaimed) );
        preRewardPeriod.rewardsClaimed = 0;
        
        curRewardPeriod.id = curRewardPeriod.id + 1;
        curRewardPeriod.startingDebtFactor = debtSystem.LastSystemDebtFactor();
        curRewardPeriod.feesToDistribute = 0;
        curRewardPeriod.feesClaimed = 0;
        curRewardPeriod.rewardsToDistribute = 0;
        curRewardPeriod.rewardsClaimed = 0;
    }

    function feePeriodDuration() external view returns (uint) {
        return OnePeriodSecs;
    }

    function recentFeePeriods(uint index) external view
        returns (
            uint256 id,
            uint256 startingDebtFactor,
            uint256 startTime,
            uint256 feesToDistribute,
            uint256 feesClaimed,
            uint256 rewardsToDistribute,
            uint256 rewardsClaimed
        )
    {
        if (index > 1) {
            return (0,0,0,0,0,0,0);
        }
        RewardPeriod memory rewardPd;
        if (index == 0) {
            rewardPd = curRewardPeriod;
        } else {
            rewardPd = preRewardPeriod;
        }
        return (
            rewardPd.id,
            rewardPd.startingDebtFactor,
            rewardPd.startTime,
            rewardPd.feesToDistribute,
            rewardPd.feesClaimed,
            rewardPd.rewardsToDistribute,
            rewardPd.rewardsClaimed
        );
    }

    function isFeesClaimable(address account) external view returns (bool feesClaimable) {
        if (collateralSystem.IsSatisfyTargetRatio(account) == false) {
            return false;
        }
        // other condition
        return true;
    }

    // total fee and total reward
    function feesAvailable(address account) public view returns (uint, uint) {
        return (123, 456);
    }

    // claim fee and reward.
    function claimFees() external returns (bool) {
        return false;
    }
}

