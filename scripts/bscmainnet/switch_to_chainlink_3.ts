import { Duration } from "luxon";
import { ethers } from "hardhat";

import EACAggregatorProxyAbi from "./abis/EACAggregatorProxy.json";

const { formatBytes32String } = ethers.utils;

const ORACLE_TYPE_CHAINLINK: number = 1;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const liquidName: string = "lXLM";
  const aggregatorAddress: string =
    "0x27Cc356A5891A3Fe6f84D0457dE4d108C6078888";

  const [LnOracleRouter] = await Promise.all(
    ["LnOracleRouter"].map((contractName) =>
      ethers.getContractFactory(contractName, {
        signer: deployer,
        libraries: {
          "contracts/SafeDecimalMath.sol:SafeDecimalMath":
            "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
        },
      })
    )
  );

  const lnOracleRouter = LnOracleRouter.attach(
    "0x475aa5fCdf2eAEAecE4F6E83121324cB293911AB"
  );

  // Double check to make sure we're not using the wrong aggregator
  const aggregator = ethers.ContractFactory.getContract(
    aggregatorAddress,
    EACAggregatorProxyAbi
  );
  const aggregatorDescription: string = await aggregator
    .connect(ethers.provider)
    .description();
  if (aggregatorDescription != `${liquidName.substr(1)} / USD`)
    throw new Error("Aggregator description mismatch");

  // Make sure the currency isn't already set to use Chainlink
  const oracleSettings = await lnOracleRouter.oracleSettings(
    formatBytes32String(liquidName)
  );
  if (oracleSettings.oracleType === ORACLE_TYPE_CHAINLINK)
    throw new Error("Already using Chainlink");

  console.log("Changing oracle to Chainlink...");
  await lnOracleRouter.connect(admin).addChainlinkOracle(
    formatBytes32String(liquidName), // currencyKey
    aggregatorAddress, // oracleAddress
    true // removeExisting
  );

  console.log("Setting stale period to 10 minutes...");
  await lnOracleRouter.connect(admin).setStalePeriodOverride(
    formatBytes32String(liquidName), // currencyKey
    Duration.fromObject({ minutes: 10 }).as("seconds") // newStalePeriod
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
