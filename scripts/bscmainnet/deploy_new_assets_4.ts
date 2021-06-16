import { formatBytes32String } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

import { expandTo18Decimals } from "../utilities";

const TOKEN_LOCK_TYPE_TRANSFER: number = 1;

const ETH_MAINNET_CHAIN_ID = 1;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const bandOracleAddress: string =
    "0xDA7a001b254CD22e46d3eAB04d937489c93174C3";

  const [
    LnAssetSystem,
    LnAssetUpgradeable,
    LnConfig,
    LnErc20Bridge,
  ] = await Promise.all(
    [
      "LnAssetSystem",
      "LnAssetUpgradeable",
      "LnConfig",
      "LnErc20Bridge",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );

  const LnOracleRouter = await ethers.getContractFactory("LnOracleRouter", {
    signer: deployer,
    libraries: {
      "contracts/SafeDecimalMath.sol:SafeDecimalMath":
        "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
    },
  });

  const lnAssetSystem = LnAssetSystem.attach(
    "0x1B220E982e5b4615715870533e968dff823BBED6"
  );
  const lnOracleRouter = LnOracleRouter.attach(
    "0x475aa5fCdf2eAEAecE4F6E83121324cB293911AB"
  );
  const lnErc20Bridge = LnErc20Bridge.attach(
    "0xF6a9bAfBc505a4Bc25888dc6aeAc57184eb2685B"
  );
  const lnConfig = LnConfig.attach(
    "0x6Eaaa70AE37aAEA71e400F86199B83dA8E0E9455"
  );

  for (const symbol of ["lDEFI"]) {
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
      TOKEN_LOCK_TYPE_TRANSFER // lockType
    );
    await lnErc20Bridge.connect(admin).addChainSupportForToken(
      formatBytes32String(symbol), // tokenKey
      ETH_MAINNET_CHAIN_ID // chainId
    );

    // Set token exchange fee rate to 0.25%
    await lnConfig.connect(admin).setUint(
      ethers.utils.formatBytes32String(symbol), // key
      expandTo18Decimals(0.0025) // value
    );

    // Add to oracle
    await lnOracleRouter.connect(admin).addBandOracle(
      formatBytes32String(symbol), // currencyKey
      "DEFI++", // bandCurrencyKey
      bandOracleAddress, // oracleAddress
      true // removeExisting
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
