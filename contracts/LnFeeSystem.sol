// SPDX-License-Identifier: MIT
pragma solidity ^0.6.12;

import "./upgradeable/LnAdminUpgradeable.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";
import "./SafeDecimalMath.sol";
import "./LnAddressCache.sol";
import "./LnDebtSystem.sol";
import "./LnCollateralSystem.sol";
import "./LnRewardLocker.sol";
import "./LnAssetSystem.sol";
import "./LnAssetUpgradeable.sol";

contract LnFeeSystem is LnAdminUpgradeable, LnAddressCache {
    using SafeMath for uint256;
    using SafeDecimalMath for uint256;

    address public constant FEE_DUMMY_ADDRESS = address(0x2048); 

    struct UserDebtData {
        uint256 PeriodID; // Period id
        uint256 debtProportion;
        uint256 debtFactor; // PRECISE_UNIT
    }

    struct RewardPeriod {
        uint256 id; // Period id
        uint256 startingDebtFactor;
        uint256 startTime;
        uint256 feesToDistribute; // 要分配的费用
        uint256 feesClaimed; // 已领取的费用
        uint256 rewardsToDistribute; // 要分配的奖励
        uint256 rewardsClaimed; // 已领取的奖励
    }

    RewardPeriod public curRewardPeriod;
    RewardPeriod public preRewardPeriod;
    uint256 public OnePeriodSecs;
    uint64 public LockTime;

    mapping (address => uint256) public userLastClaimedId;

    mapping (address => UserDebtData[2]) public userPeriodDebt; // one for current period, one for pre period

    //
    LnDebtSystem public debtSystem;
    LnCollateralSystem public collateralSystem;
    LnRewardLocker public rewardLocker;
    LnAssetSystem mAssets;

    address public exchangeSystemAddress;
    address public rewardDistributer;

    function __LnFeeSystem_init(address _admin) public initializer {
        __LnAdminUpgradeable_init(_admin);

        OnePeriodSecs = 1 weeks;
        LockTime = uint64(52 weeks);
    }

    // Note: before start run need call this func to init.
    function Init(address _exchangeSystem, address _rewardDistri) public onlyAdmin {
        exchangeSystemAddress = _exchangeSystem;
        rewardDistributer = _rewardDistri;
    }

    //set period data, maybe copy from old contract
    function SetPeriodData(int16 index, // 0 current 1 pre
            uint256 id,
            uint256 startingDebtFactor,
            uint256 startTime,
            uint256 feesToDistribute,
            uint256 feesClaimed,
            uint256 rewardsToDistribute,
            uint256 rewardsClaimed
        ) public onlyAdmin {
        RewardPeriod storage toset = index == 0? curRewardPeriod : preRewardPeriod;
        toset.id = id;
        toset.startingDebtFactor = startingDebtFactor;
        toset.startTime = startTime;
        toset.feesToDistribute = feesToDistribute;
        toset.feesClaimed = feesClaimed;
        toset.rewardsToDistribute = rewardsToDistribute;
        toset.rewardsClaimed = rewardsClaimed;
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
    event FeesClaimed(address user, uint lUSDAmount, uint linaRewards);

    function updateAddressCache(LnAddressStorage _addressStorage ) onlyAdmin public override
    {
        debtSystem = LnDebtSystem(_addressStorage.getAddressWithRequire( "LnDebtSystem", "LnDebtSystem address not valid" ));
        address payable collateralAddress = payable(_addressStorage.getAddressWithRequire( "LnCollateralSystem","LnCollateralSystem address not valid" ));
        collateralSystem = LnCollateralSystem( collateralAddress );
        rewardLocker = LnRewardLocker(_addressStorage.getAddressWithRequire( "LnRewardLocker", "LnRewardLocker address not valid" ));
        mAssets = LnAssetSystem(_addressStorage.getAddressWithRequire( "LnAssetSystem", "LnAssetSystem address not valid" ));
        
        // as Init func. record LnExchangeSystem address
        exchangeSystemAddress = _addressStorage.getAddressWithRequire( "LnExchangeSystem","LnExchangeSystem address not valid" );

        emit CachedAddressUpdated( "LnDebtSystem", address(debtSystem) );
        emit CachedAddressUpdated( "LnCollateralSystem", address(collateralSystem) );
        emit CachedAddressUpdated( "LnRewardLocker", address(rewardLocker) );
        emit CachedAddressUpdated( "LnAssetSystem", address(mAssets) );
        emit CachedAddressUpdated( "LnExchangeSystem", address(exchangeSystemAddress) );
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
        curRewardPeriod.startTime = now;
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

    modifier onlyDebtSystem() {
        require(msg.sender == address(debtSystem), "Only Debt system call");
        _;
    }

    // build record
    function RecordUserDebt(address user, uint256 debtProportion, uint256 debtFactor) public onlyDebtSystem {
        uint256 curId = curRewardPeriod.id;
        uint256 minPos = 0;
        if (userPeriodDebt[user][0].PeriodID > userPeriodDebt[user][1].PeriodID) {
            minPos = 1;
        }
        uint256 pos = minPos;
        for (uint64 i = 0; i < userPeriodDebt[user].length; i++) {
            if (userPeriodDebt[user][i].PeriodID == curId) {
                pos = i;
                break;
            }
        }
        userPeriodDebt[user][pos].PeriodID = curId;
        userPeriodDebt[user][pos].debtProportion = debtProportion;
        userPeriodDebt[user][pos].debtFactor = debtFactor;
    }

    function isFeesClaimable(address account) public view returns (bool feesClaimable) {
        if (collateralSystem.IsSatisfyTargetRatio(account) == false) {
            return false;
        }

        if (userLastClaimedId[account] == preRewardPeriod.id) {
            return false;
        }

        // TODO: other condition?
        return true;
    }

    // total fee and total reward
    function feesAvailable(address user) public view returns (uint, uint) {
        if (preRewardPeriod.feesToDistribute == 0 && preRewardPeriod.rewardsToDistribute == 0) {
            return (0,0);
        }
        uint256 debtFactor = 0;
        uint256 debtProportion = 0;
        uint256 pid = 0; //get last period factor
        for (uint64 i = 0; i < userPeriodDebt[user].length; i++) {
            if (userPeriodDebt[user][i].PeriodID < curRewardPeriod.id
            && userPeriodDebt[user][i].PeriodID > pid) {
                pid = curRewardPeriod.id;
                debtFactor = userPeriodDebt[user][i].debtFactor;
                debtProportion = userPeriodDebt[user][i].debtProportion;
            }
        }
        //
        //if (debtProportion == 0) {
        //    (debtProportion, debtFactor) = debtSystem.userDebtState(user);
        //}

        if (debtProportion == 0 ) {
            return (0,0);
        }

        uint256 lastPeriodDebtFactor = curRewardPeriod.startingDebtFactor;
        uint256 userDebtProportion = lastPeriodDebtFactor
                .divideDecimalRoundPrecise(debtFactor)
                .multiplyDecimalRoundPrecise(debtProportion);

        uint256 fee = preRewardPeriod.feesToDistribute
                .decimalToPreciseDecimal()
                .multiplyDecimalRoundPrecise(userDebtProportion)
                .preciseDecimalToDecimal();

        uint256 reward = preRewardPeriod.rewardsToDistribute
                .decimalToPreciseDecimal()
                .multiplyDecimalRoundPrecise(userDebtProportion)
                .preciseDecimalToDecimal();
        return (fee, reward);
    }

    // claim fee and reward.
    function claimFees() external returns (bool) {
        address user = msg.sender;
        require( isFeesClaimable(user), "User is not claimable" );

        userLastClaimedId[user] = preRewardPeriod.id;
        // fee reward: mint lusd
        // : rewardLocker.appendReward(use, reward, now + 1 years);
        (uint256 fee, uint256 reward) = feesAvailable(user);
        require(fee > 0 || reward > 0, "Nothing to claim");

        if (fee > 0) {
            LnAssetUpgradeable lusd = LnAssetUpgradeable( mAssets.getAddressWithRequire( "lUSD", "get lUSD asset address fail" ));
            lusd.burn( FEE_DUMMY_ADDRESS, fee );
            lusd.mint(user, fee);
        }

        if (reward > 0) {
            uint64 totime = uint64(now + LockTime);
            rewardLocker.appendReward(user, reward, totime);
        }
        emit FeesClaimed(user, fee, reward);
        return true;
    }

    // Reserved storage space to allow for layout changes in the future.
    uint256[38] private __gap;
}

contract LnFeeSystemTest is LnFeeSystem {

    function __LnFeeSystemTest_init(address _admin) public initializer {
        __LnFeeSystem_init(_admin);

        OnePeriodSecs = 6 hours;
        LockTime = 1 hours;
    }
}
