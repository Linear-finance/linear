import { Duration } from "luxon";
import { ethers, upgrades } from "hardhat";
import { formatBytes32String } from "ethers/lib/utils";
import { expandTo18Decimals } from "../utilities";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const accessControlAddress = "0x7b260D7851d9DC9EE27Dc8d6fAbDB2d568711708";
  const assetSystemAddress = "0x1B220E982e5b4615715870533e968dff823BBED6";
  const bandProtocolAddress = "0xA4e2866745E115F4467923603fFDe0f73732B849";
  const buildBurnSystemAddress = "0x4B1356cf2068030924dBD8FcA1144AFBe847Af5F";
  const collateralSystemAddress = "0xcE2c94d40e289915d4401c3802D75f6cA5FEf57E";
  const configAddress = "0x6Eaaa70AE37aAEA71e400F86199B83dA8E0E9455";
  const debtSystemAddress = "0xd5C594FB9055E34926CdB46b32D427c09146e96A";
  const rewardLockerAddress = "0x66D60EDc3876b8aFefD324d4edf105fd5c4aBeDc";

  // Load contract factories
  const [
    LnAccessControl,
    LnAssetSystem,
    LnCollateralSystem,
    LnConfig,
    LnRewardLocker,
  ] = await Promise.all(
    [
      "LnAccessControl",
      "LnAssetSystem",
      "LnCollateralSystem",
      "LnConfig",
      "LnRewardLocker",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );
  const [LnBuildBurnSystem, LnLiquidation] = await Promise.all(
    ["LnBuildBurnSystem", "LnLiquidation"].map((contractName) =>
      ethers.getContractFactory(contractName, {
        signer: deployer,
        libraries: {
          "contracts/SafeDecimalMath.sol:SafeDecimalMath":
            "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
        },
      })
    )
  );

  const lnAccessControl = LnAccessControl.attach(accessControlAddress);
  const lnAssetSystem = LnAssetSystem.attach(assetSystemAddress);
  const lnBuildBurnSystem = LnBuildBurnSystem.attach(buildBurnSystemAddress);
  const lnCollateralSystem = LnCollateralSystem.attach(collateralSystemAddress);
  const lnConfig = LnConfig.attach(configAddress);
  const lnRewardLocker = LnRewardLocker.attach(rewardLockerAddress);

  console.log("Deploying liquidation contract...");
  const lnLiquidation = await upgrades.deployProxy(
    LnLiquidation,
    [
      lnBuildBurnSystem.address, // _lnBuildBurnSystem
      lnCollateralSystem.address, // _lnCollateralSystem
      lnConfig.address, // _lnConfig
      debtSystemAddress, // _lnDebtSystem
      bandProtocolAddress, // _lnPrices
      lnRewardLocker.address, // _lnRewardLocker
      admin.address, // _admin
    ],
    {
      initializer: "__LnLiquidation_init",
      unsafeAllowLinkedLibraries: true,
    }
  );
  console.log("Lquidation contract deployed to:", lnLiquidation.address);

  console.log("Updating address cache...");
  await lnAssetSystem
    .connect(admin)
    .updateAll(
      [ethers.utils.formatBytes32String("LnLiquidation")],
      [lnLiquidation.address]
    );

  console.log("Setting config item LiquidationRatio...");
  await lnConfig.connect(admin).setUint(
    formatBytes32String("LiquidationRatio"), // key
    expandTo18Decimals(0.5) // value
  );

  console.log("Setting config item LiquidationMarkerReward...");
  await lnConfig.connect(admin).setUint(
    formatBytes32String("LiquidationMarkerReward"), // key
    expandTo18Decimals(0.05) // value
  );

  console.log("Setting config item LiquidationLiquidatorReward...");
  await lnConfig.connect(admin).setUint(
    formatBytes32String("LiquidationLiquidatorReward"), // key
    expandTo18Decimals(0.1) // value
  );

  console.log("Setting config item LiquidationDelay...");
  await lnConfig.connect(admin).setUint(
    formatBytes32String("LiquidationDelay"), // key
    Duration.fromObject({ days: 3 }).as("seconds") // value
  );

  console.log("Granting MOVE_REWARD role to liquidation contract...");
  await lnAccessControl.connect(admin).SetRoles(
    formatBytes32String("MOVE_REWARD"), // roleType
    [lnLiquidation.address], // addresses
    [true] // setTo
  );

  console.log("Upgrading contract LnBuildBurnSystem...");
  await upgrades.upgradeProxy(buildBurnSystemAddress, LnBuildBurnSystem, {
    unsafeAllowLinkedLibraries: true,
  });

  console.log("Upgrading contract LnCollateralSystem...");
  await upgrades.upgradeProxy(collateralSystemAddress, LnCollateralSystem, {});

  console.log("Upgrading contract LnRewardLocker...");
  await upgrades.upgradeProxy(rewardLockerAddress, LnRewardLocker, {});

  console.log("Updating LnBuildBurnSystem address cache...");
  await lnBuildBurnSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);

  console.log("Updating LnCollateralSystem address cache...");
  await lnCollateralSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
