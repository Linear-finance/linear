import { DateTime, Duration } from "luxon";
import { ethers } from "hardhat";
import { expandTo18Decimals } from "../tests/utilities";

async function main() {
  const [deployer] = await ethers.getSigners();

  const mockTokenHolder: string = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";

  const linaAddress: string = "0x2910E325cf29dd912E3476B61ef12F49cb931096";
  const lusdAddress: string = "0x7348E6e9521b577470f88eE81552306AdA367644";

  let busdAddress: string = "";
  let lpAddress: string = "";

  const periodDuration: Duration = Duration.fromObject({
    hours: 1,
  });
  const startTime: DateTime = DateTime.fromSeconds(
    Math.floor(
      (DateTime.utc().toSeconds() + periodDuration.as("seconds") - 1) /
        periodDuration.as("seconds")
    ) * periodDuration.as("seconds")
  );

  console.log("Period Duration:", periodDuration.as("seconds"), "seconds");
  console.log("Start Time:", startTime.toISO());

  const [
    LnVaultDynamicInterestPool,
    LnVaultFixedRewardPool,
    MockERC20,
  ] = await Promise.all(
    [
      "LnVaultDynamicInterestPool",
      "LnVaultFixedRewardPool",
      "MockERC20",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );

  const busd = busdAddress
    ? MockERC20.attach(busdAddress)
    : await MockERC20.deploy(
        "BUSD Token", // _name
        "BUSD" // _symbol
      );
  console.log("BUSD Token:", busd.address);

  const lp = lpAddress
    ? MockERC20.attach(lpAddress)
    : await MockERC20.deploy(
        "Pancake LPs", // _name
        "Cake-LP" // _symbol
      );
  console.log("LP Token:", lp.address);

  if (!busdAddress) {
    await busd.connect(deployer).mint(
      mockTokenHolder, // account
      expandTo18Decimals(1_000_000_000) // amount
    );
  }

  if (!lpAddress) {
    await lp.connect(deployer).mint(
      mockTokenHolder, // account
      expandTo18Decimals(1_000_000_000) // amount
    );
  }

  const lusdPool = await LnVaultDynamicInterestPool.deploy();
  await (
    await lusdPool.connect(deployer).__LnVaultDynamicInterestPool_init(
      startTime.toSeconds(), // _firstPeriodStartTime
      periodDuration.as("seconds"), // _periodDuration
      expandTo18Decimals(50_000), // _totalSubscriptionLimit
      expandTo18Decimals(5_000), // _userSubscriptionLimit
      lusdAddress, // _stakeToken
      lusdAddress // _interestToken
    )
  ).wait();
  console.log("LUSD-BUSD Pool:", lusdPool.address);

  const busdPool = await LnVaultDynamicInterestPool.deploy();
  await (
    await lusdPool.connect(deployer).__LnVaultDynamicInterestPool_init(
      startTime.toSeconds(), // _firstPeriodStartTime
      periodDuration.as("seconds"), // _periodDuration
      expandTo18Decimals(50_000), // _totalSubscriptionLimit
      expandTo18Decimals(5_000), // _userSubscriptionLimit
      lusdAddress, // _stakeToken
      busdAddress // _interestToken
    )
  ).wait();
  console.log("LUSD-BUSD Pool:", lusdPool.address);

  const linaPool = await LnVaultFixedRewardPool.deploy();
  await (
    await linaPool.connect(deployer).__LnVaultFixedRewardPool_init(
      startTime.toSeconds(), // _startTime
      expandTo18Decimals(1), // _rewardPerSecond
      lp.address, // _stakeToken
      linaAddress // _rewardToken
    )
  ).wait();
  console.log("LP-LINA Pool:", linaPool.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
