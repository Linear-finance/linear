import { ethers, upgrades } from "hardhat";
import { formatBytes32String } from "ethers/lib/utils";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const configAddress = "0x6Eaaa70AE37aAEA71e400F86199B83dA8E0E9455";
  const exchangeAddress = "0x2C33d6Fa54bB6Fa81B3a569D639Fe23ab36cca7f";

  // Load contracts
  const LnConfig = await ethers.getContractFactory("LnConfig");
  const LnExchangeSystem = await ethers.getContractFactory("LnExchangeSystem", {
    signer: deployer,
    libraries: {
      "contracts/SafeDecimalMath.sol:SafeDecimalMath":
        "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
    },
  });

  const lnConfig = LnConfig.attach(configAddress);

  console.log("Setting config item TradeRevertDelay...");
  await lnConfig.connect(admin).setUint(
    formatBytes32String("TradeRevertDelay"), // key
    600 // value
  );

  console.log("Upgrading exchange contract...");
  await upgrades.upgradeProxy(exchangeAddress, LnExchangeSystem, {
    unsafeAllowLinkedLibraries: true,
  });
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
