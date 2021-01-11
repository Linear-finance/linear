import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const relayerAddress: string = "0xd8A059Bd3307F64E759D139E5e4490e622Fcb862";

  const LnErc20Bridge = await ethers.getContractFactory("LnErc20Bridge");

  const lnErc20Bridge = await upgrades.deployProxy(
    LnErc20Bridge,
    [
      relayerAddress, // _relayer
      admin.address, // _admin
    ],
    {
      initializer: "__LnErc20Bridge_init",
    }
  );
  console.log("LnErc20Bridge proxy deployed to:", lnErc20Bridge.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
