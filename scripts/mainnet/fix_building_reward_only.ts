import { ethers, upgrades } from "hardhat";

async function main() {
  const LnCollateralSystem = await ethers.getContractFactory(
    "LnCollateralSystem"
  );

  await upgrades.upgradeProxy(
    "0xBb7cF9A1b0C2aF40B98a9018E3e9f756fE0aD3bb",
    LnCollateralSystem
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
