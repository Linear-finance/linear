import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const LnAssetUpgradeable = await ethers.getContractFactory(
    "LnAssetUpgradeable",
    deployer
  );

  for (const symbol of ["lAXS"]) {
    /**
     * Create synthetic asset
     */
    const assetToken = await upgrades.deployProxy(
      LnAssetUpgradeable,
      [
        ethers.utils.formatBytes32String(symbol), // bytes32 _key,
        symbol, // _name,
        symbol, // _symbol
        admin.address, // _admin
      ],
      {
        initializer: "__LnAssetUpgradeable_init",
      }
    );

    console.log(`${symbol} token proxy deployed to ${assetToken.address}`);
    /**
     * Update synth address cache
     */
    await assetToken
      .connect(admin)
      .updateAddressCache("0xa6048Ed66C8fF57837361dee2B15711740212571");

    /**
     * Update candidate
     */
    await assetToken
      .connect(admin)
      .setCandidate("0x70A9016438C8b6236260087d043a7F412CF73944");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
