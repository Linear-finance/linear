import { DateTime, Duration } from "luxon";
import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expandTo18Decimals, uint256Max } from "../utilities";
import { deployLinearStack, DeployedStack } from "../utilities/init";
import {
  getBlockDateTime,
  setNextBlockTimestamp,
} from "../utilities/timeTravel";

describe("Integration | Exchange", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress;

  let stack: DeployedStack;

  const stalePeriod: Duration = Duration.fromObject({ hours: 12 });
  let priceUpdateTime: DateTime;

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);

    priceUpdateTime = await getBlockDateTime(ethers.provider);

    // Set LINA price to $0.01
    await stack.lnDefaultPrices.connect(admin).updateAll(
      [ethers.utils.formatBytes32String("LINA")], // currencyNames
      [expandTo18Decimals(0.01)], // newPrices
      priceUpdateTime.toSeconds() // timeSent
    );

    // Set lBTC price to $20,000
    await stack.lnDefaultPrices.connect(admin).updateAll(
      [ethers.utils.formatBytes32String("lBTC")], // currencyNames
      [expandTo18Decimals(20_000)], // newPrices
      priceUpdateTime.toSeconds() // timeSent
    );

    // Set BTC exchange fee rate to 1%
    await stack.lnConfig.connect(admin).setUint(
      ethers.utils.formatBytes32String("lBTC"), // key
      expandTo18Decimals(0.01) // value
    );

    // Mint 1,000,000 LINA to Alice
    await stack.linaToken
      .connect(admin)
      .mint(alice.address, expandTo18Decimals(1_000_000));

    // Alice stakes all LINA
    await stack.linaToken
      .connect(alice)
      .approve(stack.lnCollateralSystem.address, uint256Max);
    await stack.lnCollateralSystem.connect(alice).Collateral(
      ethers.utils.formatBytes32String("LINA"), // _currency
      expandTo18Decimals(1_000_000) // _amount
    );

    // Alice builds 1,000 lUSD
    await stack.lnBuildBurnSystem.connect(alice).BuildAsset(
      expandTo18Decimals(1_000) // amount
    );
  });

  it("fee not splitted when fee holder is not set", async () => {
    // Set fee split ratio to 30%
    await stack.lnConfig.connect(admin).setUint(
      ethers.utils.formatBytes32String("FoundationFeeSplit"), // key
      expandTo18Decimals(0.3) // value
    );

    // Alice exchanges 500 lUSD for 0.025 lBTC
    await stack.lnExchangeSystem.connect(alice).exchange(
      ethers.utils.formatBytes32String("lUSD"), // sourceKey
      expandTo18Decimals(500), // sourceAmount
      alice.address, // destAddr
      ethers.utils.formatBytes32String("lBTC") // destKey
    );

    // All fees (0.025 * 0.01 * 20000 = 5) go to pool
    expect(
      await stack.lusdToken.balanceOf(stack.lnRewardSystem.address)
    ).to.equal(expandTo18Decimals(5));

    // Proceedings after fees: 500 / 20000 * (1 - 0.01) = 0.02475 BTC
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(500)
    );
    expect(await stack.lbtcToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(0.02475)
    );
  });

  it("fee not splitted when split ratio is not set", async () => {
    // Set fee holder to bob
    await stack.lnExchangeSystem.connect(admin).setFoundationFeeHolder(
      bob.address // _foundationFeeHolder
    );

    // Alice exchanges 500 lUSD for 0.025 lBTC
    await stack.lnExchangeSystem.connect(alice).exchange(
      ethers.utils.formatBytes32String("lUSD"), // sourceKey
      expandTo18Decimals(500), // sourceAmount
      alice.address, // destAddr
      ethers.utils.formatBytes32String("lBTC") // destKey
    );

    // All fees (0.025 * 0.01 * 20000 = 5) go to pool
    expect(
      await stack.lusdToken.balanceOf(stack.lnRewardSystem.address)
    ).to.equal(expandTo18Decimals(5));
    expect(await stack.lusdToken.balanceOf(bob.address)).to.equal(0);

    // Proceedings after fees: 500 / 20000 * (1 - 0.01) = 0.02475 BTC
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(500)
    );
    expect(await stack.lbtcToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(0.02475)
    );
  });

  it("fee splitted to pool and foundation", async () => {
    // Set fee split ratio to 30%
    await stack.lnConfig.connect(admin).setUint(
      ethers.utils.formatBytes32String("FoundationFeeSplit"), // key
      expandTo18Decimals(0.3) // value
    );

    // Set fee holder to bob
    await stack.lnExchangeSystem.connect(admin).setFoundationFeeHolder(
      bob.address // _foundationFeeHolder
    );

    // Alice exchanges 500 lUSD for 0.025 lBTC
    await expect(
      stack.lnExchangeSystem.connect(alice).exchange(
        ethers.utils.formatBytes32String("lUSD"), // sourceKey
        expandTo18Decimals(500), // sourceAmount
        alice.address, // destAddr
        ethers.utils.formatBytes32String("lBTC") // destKey
      )
    )
      .to.emit(stack.lnExchangeSystem, "ExchangeAsset")
      .withArgs(
        alice.address, // fromAddr
        ethers.utils.formatBytes32String("lUSD"), // sourceKey
        expandTo18Decimals(500), // sourceAmount
        alice.address, // destAddr
        ethers.utils.formatBytes32String("lBTC"), // destKey
        expandTo18Decimals(0.02475), // destRecived
        expandTo18Decimals(3.5), // feeForPool
        expandTo18Decimals(1.5) // feeForFoundation
      );

    /**
     * Fee split:
     *   Total = 0.025 * 0.01 * 20000 = 5 lUSD
     *   Foundation = 5 * 0.3 = 1.5 lUSD
     *   Pool = 5 - 1.5 = 3.5 lUSD
     */
    expect(
      await stack.lusdToken.balanceOf(stack.lnRewardSystem.address)
    ).to.equal(expandTo18Decimals(3.5));
    expect(await stack.lusdToken.balanceOf(bob.address)).to.equal(
      expandTo18Decimals(1.5)
    );

    // Proceedings after fees: 500 / 20000 * (1 - 0.01) = 0.02475 BTC
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(500)
    );
    expect(await stack.lbtcToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(0.02475)
    );
  });

  it("cannot exchange when price is staled", async () => {
    const exchangeAction = () =>
      stack.lnExchangeSystem.connect(alice).exchange(
        ethers.utils.formatBytes32String("lUSD"), // sourceKey
        expandTo18Decimals(500), // sourceAmount
        alice.address, // destAddr
        ethers.utils.formatBytes32String("lBTC") // destKey
      );

    // Can exchange when price is not staled
    await setNextBlockTimestamp(
      ethers.provider,
      priceUpdateTime.plus(stalePeriod)
    );
    await exchangeAction();

    // Cannot exchange once price becomes staled
    await setNextBlockTimestamp(
      ethers.provider,
      priceUpdateTime.plus(stalePeriod).plus({ seconds: 1 })
    );
    await expect(exchangeAction()).to.be.revertedWith(
      "LnDefaultPrices: staled price data"
    );
  });

  it("can sell when position entrance is disabled", async () => {
    await stack.lnExchangeSystem.connect(alice).exchange(
      ethers.utils.formatBytes32String("lUSD"), // sourceKey
      expandTo18Decimals(500), // sourceAmount
      alice.address, // destAddr
      ethers.utils.formatBytes32String("lBTC") // destKey
    );

    await stack.lnExchangeSystem.connect(admin).setExitPositionOnly(true);

    // Can still sell
    await stack.lnExchangeSystem.connect(alice).exchange(
      ethers.utils.formatBytes32String("lBTC"), // sourceKey
      expandTo18Decimals(0.01), // sourceAmount
      alice.address, // destAddr
      ethers.utils.formatBytes32String("lUSD") // destKey
    );
  });

  it("cannot buy when position entrance is disabled", async () => {
    await stack.lnExchangeSystem.connect(alice).exchange(
      ethers.utils.formatBytes32String("lUSD"), // sourceKey
      expandTo18Decimals(500), // sourceAmount
      alice.address, // destAddr
      ethers.utils.formatBytes32String("lBTC") // destKey
    );

    await stack.lnExchangeSystem.connect(admin).setExitPositionOnly(true);

    // Can no longer buy
    await expect(
      stack.lnExchangeSystem.connect(alice).exchange(
        ethers.utils.formatBytes32String("lUSD"), // sourceKey
        expandTo18Decimals(500), // sourceAmount
        alice.address, // destAddr
        ethers.utils.formatBytes32String("lBTC") // destKey
      )
    ).to.be.revertedWith("LnExchangeSystem: can only exit position");
  });
});
