import { ethers, upgrades } from "hardhat";

async function main() {
  const LnCollateralSystem = await ethers.getContractFactory(
    "LnCollateralSystem"
  );
  const LnRewardLocker = await ethers.getContractFactory("LnRewardLocker");

  await upgrades.upgradeProxy(
    "0xBb7cF9A1b0C2aF40B98a9018E3e9f756fE0aD3bb",
    LnCollateralSystem
  );
  await upgrades.upgradeProxy(
    "0x6707e1B78DE157Aac4115ce09dBC4b699d89E331",
    LnRewardLocker
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
