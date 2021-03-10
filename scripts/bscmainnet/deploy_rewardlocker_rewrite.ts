import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const linaTokenAddress = "0x762539b45A1dCcE3D36d080F74d1AED37844b878";
  const lnAccessControlAddres = "0x7b260D7851d9DC9EE27Dc8d6fAbDB2d568711708";

  const LnRewardLocker = await ethers.getContractFactory(
    "LnRewardLocker",
    deployer
  );

  const lnRewardLocker = await upgrades.deployProxy(
    LnRewardLocker,
    [
      linaTokenAddress, // _linaTokenAddr
      lnAccessControlAddres, // _accessCtrl
      admin.address, // _admin
    ],
    {
      initializer: "__LnRewardLocker_init",
    }
  );

  console.log(
    `Rewritten LnRewardLocker contract proxy deployed to: ${lnRewardLocker.address}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
