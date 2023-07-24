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
      .updateAddressCache("0x1B220E982e5b4615715870533e968dff823BBED6");

    /**
     * Update candidate
     */
    await assetToken
      .connect(admin)
      .setCandidate("0x200201F7F0EF1CF4C069b59DAB534F9907966247");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
