import { ethers } from "hardhat";
import { Duration } from "luxon";

import { LnConfig__factory } from "../../typechain";

const { formatBytes32String } = ethers.utils;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const configAddress = "0x6Eaaa70AE37aAEA71e400F86199B83dA8E0E9455";

  const lnConfig = LnConfig__factory.connect(configAddress, admin);

  await lnConfig.setUint(
    formatBytes32String("LiquidationDelay"),
    Duration.fromObject({ hours: 48 }).as("seconds")
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
