import { DateTime, Duration } from "luxon";
import { ethers, upgrades } from "hardhat";
import { expandTo18Decimals } from "../utilities";
import { uint256Max } from "../../tests/utilities";

async function main() {
  const [deployer] = await ethers.getSigners();

  const lusdAddress = "0x23e8a70534308a4AAF76fb8C32ec13d17a3BD89e";
  const busdAddress = "0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56";
  const lpAddress = "0x392f351FC02a3B74F7900dE81a9aaAC13EC28E95";
  const linaAddress = "0x762539b45A1dCcE3D36d080F74d1AED37844b878";

  // Load contract factories
  const [
    LnVaultDynamicInterestPool,
    LnVaultFixedRewardPool,
  ] = await Promise.all(
    [
      "LnVaultDynamicInterestPool",
      "LnVaultFixedRewardPool",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );

  const lusdBusdPool = await upgrades.deployProxy(
    LnVaultDynamicInterestPool,
    [
      DateTime.fromISO("2021-05-27T04:00:00Z").toSeconds(), // _firstPeriodStartTime
      Duration.fromObject({ days: 7 }).as("seconds"), // _periodDuration
      expandTo18Decimals(250_000), // _totalSubscriptionLimit
      uint256Max, // _userSubscriptionLimit
      lusdAddress, // _stakeToken
      busdAddress, // _interestToken
    ],
    {
      initializer: "__LnVaultDynamicInterestPool_init",
    }
  );
  console.log("LnVaultDynamicInterestPool_LUSD_BUSD:", lusdBusdPool.address);

  const lusdLusdPool = await upgrades.deployProxy(
    LnVaultDynamicInterestPool,
    [
      DateTime.fromISO("2021-05-27T04:00:00Z").toSeconds(), // _firstPeriodStartTime
      Duration.fromObject({ days: 7 }).as("seconds"), // _periodDuration
      expandTo18Decimals(250_000), // _totalSubscriptionLimit
      uint256Max, // _userSubscriptionLimit
      lusdAddress, // _stakeToken
      lusdAddress, // _interestToken
    ],
    {
      initializer: "__LnVaultDynamicInterestPool_init",
    }
  );
  console.log("LnVaultDynamicInterestPool_LUSD_LUSD:", lusdLusdPool.address);

  const lpPool = await upgrades.deployProxy(
    LnVaultFixedRewardPool,
    [
      DateTime.fromISO("2021-05-26T08:00:00Z").toSeconds(), // _startTime
      expandTo18Decimals(500_000).div(
        Duration.fromObject({ weeks: 1 }).as("seconds")
      ), // _rewardPerSecond
      lpAddress, // _stakeToken
      linaAddress, // _rewardToken
    ],
    {
      initializer: "__LnVaultFixedRewardPool_init",
    }
  );
  console.log("LnVaultFixedRewardPool_BUSDLUSDLP_LINA:", lpPool.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
