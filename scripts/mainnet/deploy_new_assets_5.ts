import { formatBytes32String } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

const TOKEN_LOCK_TYPE_MINT_BURN: number = 2;

const BSC_MAINNET_CHAIN_ID: number = 56;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const [LnAssetSystem, LnAssetUpgradeable, LnErc20Bridge] = await Promise.all(
    [
      "LnAssetSystem",
      "LnAssetUpgradeable",
      "LnErc20Bridge",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );

  const lnAssetSystem = LnAssetSystem.attach(
    "0xa6048Ed66C8fF57837361dee2B15711740212571"
  );
  const lnErc20Bridge = LnErc20Bridge.attach(
    "0x6546454a1C120A7D7a142C6FA9ba9Ef5E9B6185C"
  );
  for (const symbol of ["lCAKE"]) {
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
    await assetToken.connect(admin).updateAddressCache(lnAssetSystem.address);

    /**
     * Register synth assets on `LnAssetSystem`
     */
    await lnAssetSystem.connect(admin).addAsset(assetToken.address);

    /**
     * Configure token bridge
     */
    await lnErc20Bridge.connect(admin).addToken(
      formatBytes32String(symbol), // tokenKey
      assetToken.address, // tokenAddress
      TOKEN_LOCK_TYPE_MINT_BURN // lockType
    );
    await lnErc20Bridge.connect(admin).addChainSupportForToken(
      formatBytes32String(symbol), // tokenKey
      BSC_MAINNET_CHAIN_ID // chainId
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
