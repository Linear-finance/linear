import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const collateralSystemAddress = "0xcE2c94d40e289915d4401c3802D75f6cA5FEf57E";
  const rewardLockerAddress = "0x66D60EDc3876b8aFefD324d4edf105fd5c4aBeDc";

  const rewarderAddress = "0xA2627045414B080B47E4Da21A7D57470BbA0E57B";

  const [LnRewardLocker, LnCollateralSystem] = await Promise.all(
    ["LnRewardLocker", "LnCollateralSystem"].map((contractName) =>
      ethers.getContractFactory(contractName, deployer)
    )
  );

  await upgrades.upgradeProxy(collateralSystemAddress, LnCollateralSystem);
  await upgrades.upgradeProxy(rewardLockerAddress, LnRewardLocker);

  const rewardLocker = LnRewardLocker.attach(rewardLockerAddress);

  await rewardLocker.updateCollateralSystemAddress(
    collateralSystemAddress //_collateralSystemAddr
  );
  await rewardLocker.updateRewarderAddress(
    rewarderAddress // _rewarderAddress
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
