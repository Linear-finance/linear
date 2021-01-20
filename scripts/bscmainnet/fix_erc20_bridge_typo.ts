import { ethers, upgrades } from "hardhat";

async function main() {
  const LnErc20Bridge = await ethers.getContractFactory("LnErc20Bridge");

  await upgrades.upgradeProxy(
    "0xF6a9bAfBc505a4Bc25888dc6aeAc57184eb2685B",
    LnErc20Bridge
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
