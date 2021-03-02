import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expandTo18Decimals } from "../utilities";
import { deployLinearStack, DeployedStack } from "../utilities/init";
import { getBlockDateTime } from "../utilities/timeTravel";

describe("Integration | Build", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress;

  let stack: DeployedStack;

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);

    // Set LINA price to $0.01
    await stack.lnDefaultPrices.connect(admin).updateAll(
      [ethers.utils.formatBytes32String("LINA")], // currencyNames
      [expandTo18Decimals(0.01)], // newPrices
      (await getBlockDateTime(ethers.provider)).toSeconds() // timeSent
    );
  });

  it("can build lUSD with just locked reward", async function () {
    // Lock 10,000 LINA of rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [expandTo18Decimals(10_000)], // _amounts
      [(await getBlockDateTime(ethers.provider)).plus({ years: 1 }).toSeconds()] // _lockTo
    );

    // Alice can build 1 lUSD without staking
    await stack.lnBuildBurnSystem.connect(alice).BuildAsset(
      expandTo18Decimals(1) // amount
    );

    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(1)
    );
  });
});
