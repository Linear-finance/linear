import { ethers, upgrades } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const liquidationAddress = "0x4f6b688Ad01777Db42Ef65e64BB392D3b24a77A8";

  const [LnLiquidation] = await Promise.all(
    ["LnLiquidation"].map((contractName) =>
      ethers.getContractFactory(contractName, {
        signer: deployer,
        libraries: {
          "contracts/SafeDecimalMath.sol:SafeDecimalMath":
            "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
        },
      })
    )
  );

  console.log("Upgrading liquidation contract...");
  await upgrades.upgradeProxy(liquidationAddress, LnLiquidation, {
    unsafeAllowLinkedLibraries: true,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
