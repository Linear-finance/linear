import { ethers, upgrades } from "hardhat";

async function main() {
  const rewardLockerAddress = "0x66D60EDc3876b8aFefD324d4edf105fd5c4aBeDc";

  const LnRewardLocker = await ethers.getContractFactory("LnRewardLocker");

  console.log("Upgrading LnRewardLocker contract...");
  await upgrades.upgradeProxy(rewardLockerAddress, LnRewardLocker);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
