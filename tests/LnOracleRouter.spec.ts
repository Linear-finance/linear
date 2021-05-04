import { ethers, upgrades, waffle } from "hardhat";
import { expect, use } from "chai";
import { BigNumber, Contract } from "ethers";
import { formatBytes32String } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expandTo18Decimals, expandToNDecimals } from "./utilities";

use(waffle.solidity);

describe("LnOracleRouter", function () {
  let deployer: SignerWithAddress, admin: SignerWithAddress;

  let oracleRouter: Contract, chainlinkAggregator: Contract;

  const assertPriceAndUpdateTime = async (
    currency: string,
    price: number | BigNumber,
    upateTime: number | BigNumber
  ): Promise<void> => {
    const priceAndUpdateTime = await oracleRouter.getPriceAndUpdatedTime(
      formatBytes32String(currency) // currencyKey
    );
    expect(priceAndUpdateTime.price).to.equal(price);
    expect(priceAndUpdateTime.time).to.equal(upateTime);
  };

  beforeEach(async function () {
    [deployer, admin] = await ethers.getSigners();

    const SafeDecimalMath = await ethers.getContractFactory("SafeDecimalMath");
    const safeDecimalMath = await SafeDecimalMath.deploy();

    const LnOracleRouter = await ethers.getContractFactory("LnOracleRouter", {
      signer: deployer,
      libraries: {
        "contracts/SafeDecimalMath.sol:SafeDecimalMath":
          safeDecimalMath.address,
      },
    });
    const MockChainlinkAggregator = await ethers.getContractFactory(
      "MockChainlinkAggregator"
    );

    oracleRouter = await upgrades.deployProxy(
      LnOracleRouter,
      [
        admin.address, // _admin
      ],
      {
        initializer: "__LnOracleRouter_init",
        unsafeAllowLinkedLibraries: true,
      }
    );
    chainlinkAggregator = await MockChainlinkAggregator.deploy();

    // Set token "LINK" to use Chainlink
    await oracleRouter.connect(admin).addChainlinkOracle(
      formatBytes32String("LINK"), // currencyKey
      chainlinkAggregator.address, // oracleAddress
      false // removeExisting
    );
  });

  it("should get result in 18 decimals regardless of Chainlink aggregator precision", async () => {
    // 8 decimals
    await chainlinkAggregator.setDecimals(8);
    await chainlinkAggregator.setLatestRoundData(
      1, // newRoundId
      expandToNDecimals(10, 8), // newAnswer
      100, // newStartedAt
      200, // newUpdatedAt
      1 // newAnsweredInRound
    );
    await assertPriceAndUpdateTime("LINK", expandTo18Decimals(10), 200);

    // 18 decimals
    await chainlinkAggregator.setDecimals(18);
    await chainlinkAggregator.setLatestRoundData(
      1, // newRoundId
      expandToNDecimals(10, 18), // newAnswer
      100, // newStartedAt
      200, // newUpdatedAt
      1 // newAnsweredInRound
    );
    await assertPriceAndUpdateTime("LINK", expandTo18Decimals(10), 200);

    // 20 decimals
    await chainlinkAggregator.setDecimals(20);
    await chainlinkAggregator.setLatestRoundData(
      1, // newRoundId
      expandToNDecimals(10, 20), // newAnswer
      100, // newStartedAt
      200, // newUpdatedAt
      1 // newAnsweredInRound
    );
    await assertPriceAndUpdateTime("LINK", expandTo18Decimals(10), 200);
  });
});
