import { ethers } from "hardhat";

import EACAggregatorProxyAbi from "./abis/EACAggregatorProxy.json";

const { formatBytes32String } = ethers.utils;

const ORACLE_TYPE_CHAINLINK: number = 1;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const liquidName: string = "lLINK";
  const aggregatorAddress: string =
    "0xca236E327F629f9Fc2c30A4E95775EbF0B89fac8";

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

  await lnOracleRouter.connect(admin).addChainlinkOracle(
    formatBytes32String(liquidName), // currencyKey
    aggregatorAddress, // oracleAddress
    true // removeExisting
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
