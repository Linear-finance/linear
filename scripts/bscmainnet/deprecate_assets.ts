import { ethers, upgrades } from "hardhat";
import { LnExchangeSystem } from "../../typechain";

const { formatBytes32String } = ethers.utils;

async function main() {
  const exchangeSystemAddress = "0x2C33d6Fa54bB6Fa81B3a569D639Fe23ab36cca7f";

  const LnExchangeSystem = await ethers.getContractFactory("LnExchangeSystem", {
    libraries: {
      "contracts/SafeDecimalMath.sol:SafeDecimalMath":
        "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
    },
  });
  console.log("Upgrading LnExchangeSystem contract...");

  const lnExchangeSystem = (await upgrades.upgradeProxy(
    exchangeSystemAddress,
    LnExchangeSystem,
    {
      unsafeAllowLinkedLibraries: true,
    }
  )) as LnExchangeSystem;

  for (const symbol of ["lXBCI", "lXLCI"]) {
    await lnExchangeSystem.setAssetExitPositionOnly(
      formatBytes32String(symbol),
      true
    );
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
