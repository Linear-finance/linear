import { ethers, upgrades } from "hardhat";

async function main() {
  const oracleRouterAddress = "0x475aa5fCdf2eAEAecE4F6E83121324cB293911AB";

  const LnOracleRouter = await ethers.getContractFactory("LnOracleRouter", {
    libraries: {
      "contracts/SafeDecimalMath.sol:SafeDecimalMath":
        "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
    },
  });

  console.log("Upgrading LnOracleRouter contract...");
  await upgrades.upgradeProxy(oracleRouterAddress, LnOracleRouter, {
    unsafeAllowLinkedLibraries: true,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
