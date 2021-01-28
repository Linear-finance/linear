import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const lnAssetSystemAddress = "0x1B220E982e5b4615715870533e968dff823BBED6";
  const lnBuildBurnSystemAddress = "0x4B1356cf2068030924dBD8FcA1144AFBe847Af5F";
  const lnCollateralSystemAddress =
    "0xcE2c94d40e289915d4401c3802D75f6cA5FEf57E";

  const [LnCollateralSystem] = await Promise.all(
    ["LnCollateralSystem"].map((contractName) =>
      ethers.getContractFactory(contractName, deployer)
    )
  );

  const [LnBuildBurnSystem] = await Promise.all(
    ["LnBuildBurnSystem"].map((contractName) =>
      ethers.getContractFactory(contractName, {
        signer: deployer,
        libraries: {
          "contracts/SafeDecimalMath.sol:SafeDecimalMath":
            "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
        },
      })
    )
  );

  await upgrades.upgradeProxy(lnBuildBurnSystemAddress, LnBuildBurnSystem, {
    unsafeAllowLinkedLibraries: true,
  });

  await upgrades.upgradeProxy(lnCollateralSystemAddress, LnCollateralSystem, {
    unsafeAllowLinkedLibraries: true,
  });

  const lnCollateralSystem = LnCollateralSystem.attach(
    lnCollateralSystemAddress
  );

  await lnCollateralSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystemAddress);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
