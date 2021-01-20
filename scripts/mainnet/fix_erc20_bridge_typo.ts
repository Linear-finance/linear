import { ethers, upgrades } from "hardhat";

async function main() {
  const LnErc20Bridge = await ethers.getContractFactory("LnErc20Bridge");

  await upgrades.upgradeProxy(
    "0x6546454a1C120A7D7a142C6FA9ba9Ef5E9B6185C",
    LnErc20Bridge
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
