import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();

  const rewardSystemAddress = "0x9C86c4764E59A336C108A6F85be48F8a9a7FaD85";

  const LnRewardSystem = await ethers.getContractFactory("LnRewardSystem");

  console.log("Upgrading LnRewardSystem contract...");
  await upgrades.upgradeProxy(rewardSystemAddress, LnRewardSystem);

  const rewardSystem = LnRewardSystem.attach(rewardSystemAddress);
  await rewardSystem
    .connect(deployer)
    .setRewardSigners([
      "0x23532Bb418c8Fb32Da79c72149b56cfbc9aC3A3F",
      "0x79091a6803F3F4Dd94746c04a0f3607E73e60358",
    ]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
