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

const { formatBytes32String } = ethers.utils;

describe("Integration | Perpetual", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress;

  let stack: DeployedStack;

  const settlementDelay: Duration = Duration.fromObject({ minutes: 1 });
  const revertDelay: Duration = Duration.fromObject({ minutes: 10 });
  let priceUpdateTime: DateTime;

  const passSettlementDelay = async (): Promise<void> => {
    await setNextBlockTimestamp(
      ethers.provider,
      (await getBlockDateTime(ethers.provider)).plus(settlementDelay)
    );
  };

  const setLbtcPrice = async (price: number): Promise<void> => {
    await stack.lnPrices.connect(admin).setPrice(
      formatBytes32String("lBTC"), // currencyKey
      expandTo18Decimals(price) // price
    );
  };

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);

    priceUpdateTime = await getBlockDateTime(ethers.provider);

    // Set settlement & revert delay
    await stack.lnConfig.connect(admin).setUint(
      ethers.utils.formatBytes32String("TradeSettlementDelay"), // key
      settlementDelay.as("seconds")
    );
    await stack.lnConfig.connect(admin).setUint(
      ethers.utils.formatBytes32String("TradeRevertDelay"), // key
      revertDelay.as("seconds")
    );

    // Set LINA price to $0.1 and lBTC to $20,000
    await stack.lnPrices.connect(admin).setPriceAndTime(
      formatBytes32String("LINA"), // currencyKey
      expandTo18Decimals(0.1), // price
      priceUpdateTime.toSeconds() // updateTime
    );
    await stack.lnPrices.connect(admin).setPriceAndTime(
      formatBytes32String("lBTC"), // currencyKey
      expandTo18Decimals(20_000), // price
      priceUpdateTime.toSeconds() // updateTime
    );

    // Mint 1,000,000 LINA to Alice
    await stack.linaToken
      .connect(admin)
      .mint(alice.address, expandTo18Decimals(1_000_000));

    // Alice stakes all LINA and builds 10,000 lUSD
    await stack.linaToken
      .connect(alice)
      .approve(stack.lnCollateralSystem.address, uint256Max);
    await stack.lnCollateralSystem.connect(alice).stakeAndBuild(
      formatBytes32String("LINA"), // stakeCurrnecy
      expandTo18Decimals(1_000_000), // stakeAmount
      expandTo18Decimals(10_000) // buildAmount
    );

    // Alice sends 1,000 lUSD to Bob
    await stack.lusdToken.connect(alice).transfer(
      bob.address, // recipient
      expandTo18Decimals(10_000) // amount
    );
    await stack.lusdToken.connect(bob).approve(
      stack.lnPerpExchange.address, // spender
      uint256Max // amount
    );
  });

  it("long position", async () => {
    await stack.lnPerpExchange.connect(bob).openPosition(
      formatBytes32String("lBTC"), // underlying
      true, // isLong
      expandTo18Decimals(0.1), // size
      expandTo18Decimals(2_000) // collateral
    );
    await passSettlementDelay();
    await stack.lnPerpExchange.connect(alice).settleAction(1);

    // Fees: 20 lUSD
    expect(await stack.lusdToken.balanceOf(stack.lbtcPerp.address)).to.equal(
      expandTo18Decimals(1_980)
    );
    expect(await stack.lbtcToken.balanceOf(stack.lbtcPerp.address)).to.equal(
      expandTo18Decimals(0.1)
    );

    expect(await stack.lnPerpPositionToken.ownerOf(1)).to.equal(bob.address);
    expect(await stack.lnPerpPositionToken.positionPerpAddresses(1)).to.equal(
      stack.lbtcPerp.address
    );

    const position = await stack.lbtcPerp.positions(1);
    expect(position.isLong).to.equal(true);
    expect(position.debt).to.equal(expandTo18Decimals(2_000));
    expect(position.locked).to.equal(expandTo18Decimals(0.1));
    expect(position.collateral).to.equal(expandTo18Decimals(1_980));

    expect(await stack.lbtcPerp.totalUsdDebt()).to.equal(
      expandTo18Decimals(2_000)
    );
  });

  it("short position", async () => {
    await stack.lnPerpExchange.connect(bob).openPosition(
      formatBytes32String("lBTC"), // underlying
      false, // isLong
      expandTo18Decimals(0.1), // size
      expandTo18Decimals(2_000) // collateral
    );
    await passSettlementDelay();
    await stack.lnPerpExchange.connect(alice).settleAction(1);

    // Fees: 20 lUSD
    expect(await stack.lusdToken.balanceOf(stack.lbtcPerp.address)).to.equal(
      expandTo18Decimals(3_980)
    );
    expect(await stack.lbtcToken.balanceOf(stack.lbtcPerp.address)).to.equal(0);

    expect(await stack.lnPerpPositionToken.ownerOf(1)).to.equal(bob.address);
    expect(await stack.lnPerpPositionToken.positionPerpAddresses(1)).to.equal(
      stack.lbtcPerp.address
    );

    const position = await stack.lbtcPerp.positions(1);
    expect(position.isLong).to.equal(false);
    expect(position.debt).to.equal(expandTo18Decimals(0.1));
    expect(position.locked).to.equal(0);
    expect(position.collateral).to.equal(expandTo18Decimals(3_980));

    expect(await stack.lbtcPerp.totalUnderlyingDebt()).to.equal(
      expandTo18Decimals(0.1)
    );
  });

  it("remove collateral on long position", async () => {
    await stack.lnPerpExchange.connect(bob).openPosition(
      formatBytes32String("lBTC"), // underlying
      true, // isLong
      expandTo18Decimals(0.1), // size
      expandTo18Decimals(2_000) // collateral
    );
    await passSettlementDelay();
    await stack.lnPerpExchange.connect(alice).settleAction(1);

    // Remove collateral
    await expect(
      stack.lbtcPerp
        .connect(bob)
        .removeCollateral(1, expandTo18Decimals(10), bob.address)
    )
      .to.emit(stack.lbtcPerp, "PositionSync")
      .withArgs(
        1,
        true,
        expandTo18Decimals(2_000),
        expandTo18Decimals(0.1),
        expandTo18Decimals(1_970)
      );

    const position = await stack.lbtcPerp.positions(1);
    expect(position.isLong).to.equal(true);
    expect(position.debt).to.equal(expandTo18Decimals(2_000));
    expect(position.locked).to.equal(expandTo18Decimals(0.1));
    expect(position.collateral).to.equal(expandTo18Decimals(1_970));
  });

  it("remove collateral on short position", async () => {
    await stack.lnPerpExchange.connect(bob).openPosition(
      formatBytes32String("lBTC"), // underlying
      false, // isLong
      expandTo18Decimals(0.1), // size
      expandTo18Decimals(2_000) // collateral
    );
    await passSettlementDelay();
    await stack.lnPerpExchange.connect(alice).settleAction(1);

    // Remove collateral
    await expect(
      stack.lbtcPerp
        .connect(bob)
        .removeCollateral(1, expandTo18Decimals(10), bob.address)
    )
      .to.emit(stack.lbtcPerp, "PositionSync")
      .withArgs(
        1,
        false,
        expandTo18Decimals(0.1),
        0,
        expandTo18Decimals(3_970)
      );

    const position = await stack.lbtcPerp.positions(1);
    expect(position.isLong).to.equal(false);
    expect(position.debt).to.equal(expandTo18Decimals(0.1));
    expect(position.locked).to.equal(0);
    expect(position.collateral).to.equal(expandTo18Decimals(3_970));
  });
});
