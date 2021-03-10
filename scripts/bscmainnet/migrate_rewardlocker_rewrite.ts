import { formatBytes32String } from "@ethersproject/strings";
import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const collateralSystemAddress = "0xcE2c94d40e289915d4401c3802D75f6cA5FEf57E";
  const rewardSystemAddress = "0x9C86c4764E59A336C108A6F85be48F8a9a7FaD85";
  const newRewardLockerAddress = "0x66D60EDc3876b8aFefD324d4edf105fd5c4aBeDc";

  const [
    LnAccessControl,
    LnAssetSystem,
    LnCollateralSystem,
    LnRewardSystem,
  ] = await Promise.all(
    [
      "LnAccessControl",
      "LnAssetSystem",
      "LnCollateralSystem",
      "LnRewardSystem",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );

  await upgrades.upgradeProxy(collateralSystemAddress, LnCollateralSystem, {
    unsafeAllowCustomTypes: true,
    unsafeAllowLinkedLibraries: true,
  });
  await upgrades.upgradeProxy(rewardSystemAddress, LnRewardSystem, {
    unsafeAllowCustomTypes: true,
  });

  const lnAccessControl = LnAccessControl.attach(
    "0x7b260D7851d9DC9EE27Dc8d6fAbDB2d568711708"
  );
  const lnAssetSystem = LnAssetSystem.attach(
    "0x1B220E982e5b4615715870533e968dff823BBED6"
  );
  const lnCollateralSystem = LnCollateralSystem.attach(collateralSystemAddress);
  const lnRewardSystem = LnRewardSystem.attach(rewardSystemAddress);

  await lnAccessControl.connect(admin).SetRoles(
    formatBytes32String("LOCK_REWARD"), // roleType
    [lnRewardSystem.address], // addresses
    [true] // setTo
  );

  await lnAssetSystem
    .connect(admin)
    .updateAll(
      [ethers.utils.formatBytes32String("LnRewardLocker")],
      [newRewardLockerAddress]
    );
  await lnCollateralSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);

  await lnRewardSystem
    .connect(admin)
    .setRewardLockerAddress(newRewardLockerAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
