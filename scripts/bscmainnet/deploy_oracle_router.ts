import { Duration } from "luxon";
import { ethers, upgrades } from "hardhat";

const { formatBytes32String } = ethers.utils;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const bandOracleAddress: string =
    "0xDA7a001b254CD22e46d3eAB04d937489c93174C3";

  const lnAssetSystemAddress = "0x1B220E982e5b4615715870533e968dff823BBED6";
  const lnBuildBurnSystemAddress = "0x4B1356cf2068030924dBD8FcA1144AFBe847Af5F";
  const lnCollateralSystemAddress =
    "0xcE2c94d40e289915d4401c3802D75f6cA5FEf57E";
  const lnExchangeSystemAddress = "0x2C33d6Fa54bB6Fa81B3a569D639Fe23ab36cca7f";
  const lnLiquidationAddress = "0x4f6b688Ad01777Db42Ef65e64BB392D3b24a77A8";

  const [LnAssetSystem, LnCollateralSystem] = await Promise.all(
    ["LnAssetSystem", "LnCollateralSystem"].map((contractName) =>
      ethers.getContractFactory(contractName, deployer)
    )
  );
  const [
    LnBuildBurnSystem,
    LnOracleRouter,
    LnExchangeSystem,
    LnLiquidation,
  ] = await Promise.all(
    [
      "LnBuildBurnSystem",
      "LnOracleRouter",
      "LnExchangeSystem",
      "LnLiquidation",
    ].map((contractName) =>
      ethers.getContractFactory(contractName, {
        signer: deployer,
        libraries: {
          "contracts/SafeDecimalMath.sol:SafeDecimalMath":
            "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
        },
      })
    )
  );

  console.log("Deploying LnOracleRouter...");
  const lnOracleRouter = await upgrades.deployProxy(
    LnOracleRouter,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LnOracleRouter_init",
      unsafeAllowLinkedLibraries: true,
    }
  );
  console.log("LnOracleRouter proxy deployed to:", lnOracleRouter.address);

  console.log("Upgrading LnLiquidation...");
  await upgrades.upgradeProxy(lnLiquidationAddress, LnLiquidation, {
    unsafeAllowLinkedLibraries: true,
  });

  const lnAssetSystem = LnAssetSystem.attach(lnAssetSystemAddress);
  const lnBuildBurnSystem = LnBuildBurnSystem.attach(lnBuildBurnSystemAddress);
  const lnCollateralSystem = LnCollateralSystem.attach(
    lnCollateralSystemAddress
  );
  const lnExchangeSystem = LnExchangeSystem.attach(lnExchangeSystemAddress);
  const lnLiquidation = LnLiquidation.attach(lnLiquidationAddress);

  console.log("Setting global stale period...");
  await lnOracleRouter.connect(admin).setGlobalStalePeriod(
    Duration.fromObject({ minutes: 2 }).as("seconds") // newStalePeriod
  );

  const liquids: string[] = [
    "lBTC",
    "lETH",
    "lLINK",
    "lTRX",
    "lDOT",
    "lYFI",
    "lBNB",
    "lADA",
    "lXLM",
    "lXAU",
    "lXAG",
    "lEUR",
    "lUNI",
    "lJPY",
    "lXLCI",
    "lXBCI",
    "lVET",
  ];

  // Use Band for all currencies first
  console.log("Setting oracle for all existing currencies...");
  await lnOracleRouter.connect(deployer).addBandOracle(
    formatBytes32String("LINA"), // currencyKey
    "LINA", // bandCurrencyKey
    bandOracleAddress, // oracleAddress
    false // removeExisting
  );
  for (const liquid of liquids) {
    await lnOracleRouter.connect(deployer).addBandOracle(
      formatBytes32String(liquid), // currencyKey
      liquid.substr(1), // bandCurrencyKey
      bandOracleAddress, // oracleAddress
      false // removeExisting
    );
  }

  console.log("Updating address cache...");
  await lnAssetSystem
    .connect(admin)
    .updateAll(
      [ethers.utils.formatBytes32String("LnPrices")],
      [lnOracleRouter.address]
    );

  console.log("Updating LnBuildBurnSystem address cache...");
  await lnBuildBurnSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);

  console.log("Updating LnCollateralSystem address cache...");
  await lnCollateralSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);

  console.log("Updating LnExchangeSystem address cache...");
  await lnExchangeSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);

  console.log("Updating LnLiquidation lnPrices field...");
  await lnLiquidation.connect(admin).setLnPrices(
    lnOracleRouter.address // newLnPrices
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
