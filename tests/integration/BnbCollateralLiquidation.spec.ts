import { Duration } from "luxon";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { formatBytes32String } from "ethers/lib/utils";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expandTo18Decimals, nullAddress, uint256Max } from "../utilities";
import { deployLinearStack, DeployedStack } from "../utilities/init";
import {
  getBlockDateTime,
  setNextBlockTimestamp,
} from "../utilities/timeTravel";

describe("Integration | Liquidation", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress;

  let stack: DeployedStack;

  const liquidationDelay: Duration = Duration.fromObject({ days: 3 });
  const bnbCurrencyKey = formatBytes32String("BNB");

  const passLiquidationDelay = async (): Promise<void> => {
    await setNextBlockTimestamp(
      ethers.provider,
      (await getBlockDateTime(ethers.provider))
        .plus(liquidationDelay)
        .plus({ seconds: 1 })
    );
  };

  const setBnbPrice = async (price: number): Promise<void> => {
    await stack.lnPrices.connect(admin).setPrice(
      bnbCurrencyKey, // currencyKey
      expandTo18Decimals(price) // price
    );
  };

  const stakeAndBuild = async (
    user: SignerWithAddress,
    stakeAmount: BigNumber,
    buildAmount: BigNumber
  ): Promise<void> => {
    await stack.lnCollateralSystem.connect(user).Collateral(
      bnbCurrencyKey, // _currency
      stakeAmount, // _amount
      {
        value: stakeAmount
      }
    );
    await stack.lnBuildBurnSystem.connect(user).BuildAssetByCurrency(
      buildAmount, // amount
      bnbCurrencyKey
    );
  };

  beforeEach(async function () {
    [deployer, alice, bob, charlie] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);

    for (const config of [
      {
        key: "BuildRatioBnb",
        value: expandTo18Decimals(0.2),
      },
      {
        key: "LiquidationRatioBnb",
        value: expandTo18Decimals(0.5),
      },
      {
        key: "LiquidationLiquidatorRewardBnb",
        value: expandTo18Decimals(0.1),
      }
    ])
      await stack.lnConfig.connect(admin).setUint(
        ethers.utils.formatBytes32String(config.key), // key
        config.value // value
      );
    await stack.lnCollateralSystem.connect(admin).UpdateTokenInfo(
      bnbCurrencyKey, // _currency
      nullAddress, // _tokenAddr
      expandTo18Decimals(0.05), // _minCollateral
      false // _close
    );

    // Set BNB price to $1000
    await setBnbPrice(1000);

    // Alice stakes 0.1 BNB ($100) and builds 20 lUSD
    await stakeAndBuild(
      alice,
      expandTo18Decimals(0.1),
      expandTo18Decimals(20)
    );

    // Bob staks 100 BNB ($100,000) nd builds 1,000 lUSD
    await stakeAndBuild(
      bob,
      expandTo18Decimals(100),
      expandTo18Decimals(1_000)
    );
  });

  it("can mark position only when C-ratio is below liquidation ratio", async () => {
    // Price of BNB changes to $400 such that Alice's C-ratio becomes 200%
    await setBnbPrice(400);

    // Can't mark Alice's position as it's not *below* liquidation ratio
    await expect(
      stack.lnLiquidation
        .connect(bob)
        .markPositionAsUndercollateralizedByCurrency(alice.address, bnbCurrencyKey)
    ).to.be.revertedWith("LnLiquidation: not undercollateralized");

    // Price of BNB drops such that Alice's C-ratio falls below liquidation ratio
    await setBnbPrice(380);

    // Can mark position normally
    await expect(
      stack.lnLiquidation
        .connect(bob)
        .markPositionAsUndercollateralizedByCurrency(alice.address, bnbCurrencyKey)
    )
      .to.emit(stack.lnLiquidation, "PositionMarked")
      .withArgs(
        alice.address, // user
        bob.address, // marker
        bnbCurrencyKey // currencySymbol
      );

    // Confirm mark
    expect(
      await stack.lnLiquidation.isPositionMarkedAsUndercollateralizedByCurrency(
        alice.address,
        bnbCurrencyKey
      )
    ).to.equal(true);
    expect(
      await stack.lnLiquidation.getUndercollateralizationMarkMarkerByCurrency(
        alice.address,
        bnbCurrencyKey
      )
    ).to.equal(bob.address);
  });

  it("can remove position mark only when C-ratio is not below issuance ratio", async () => {
    // Alice gets marked for liquidation
    await setBnbPrice(350);
    await stack.lnLiquidation
      .connect(bob)
      .markPositionAsUndercollateralizedByCurrency(alice.address, bnbCurrencyKey);

    // BNB price goes to $99. Alice cannot remove mark
    await setBnbPrice(99);

    await expect(
      stack.lnLiquidation
        .connect(alice)
        .removeUndercollateralizationMarkByCurrency(alice.address, bnbCurrencyKey)
    ).to.be.revertedWith("LnLiquidation: still undercollateralized");

    // BNB price goes to $1000. Alice can now remove mark
    await setBnbPrice(1000);
    await expect(
      stack.lnLiquidation
        .connect(alice)
        .removeUndercollateralizationMarkByCurrency(alice.address, bnbCurrencyKey)
    )
      .to.emit(stack.lnLiquidation, "PositionUnmarked")
      .withArgs(
        alice.address, // user
        bnbCurrencyKey // currencySymbol
      );
  });

  it("cannot liquidate position without mark", async () => {
    // Alice should be liquidated at $35
    await setBnbPrice(350);

    await expect(
      stack.lnLiquidation.connect(bob).liquidateCollateralPosition(alice.address, bnbCurrencyKey, 1, [])
    ).to.be.revertedWith("LnLiquidation: not marked for undercollateralized");
  });

  it("can liquidate position only when delay is passed", async () => {
    // Alice gets marked for liquidation
    await setBnbPrice(350);
    const markTime = (await getBlockDateTime(ethers.provider)).plus({
      days: 1,
    });
    await setNextBlockTimestamp(ethers.provider, markTime);
    await stack.lnLiquidation
      .connect(bob)
      .markPositionAsUndercollateralizedByCurrency(alice.address, bnbCurrencyKey);

    // Cannot liquidate before delay is passed
    await setNextBlockTimestamp(
      ethers.provider,
      markTime.plus(liquidationDelay)
    );
    await expect(
      stack.lnLiquidation.connect(bob).liquidateCollateralPosition(alice.address, bnbCurrencyKey, 1000, [])
    ).to.be.revertedWith("LnLiquidation: liquidation delay not passed");

    // Can liquidate after delay is passed
    await setNextBlockTimestamp(
      ethers.provider,
      markTime.plus(liquidationDelay).plus({ seconds: 1 })
    );
    await stack.lnLiquidation
      .connect(bob)
      .liquidateCollateralPosition(alice.address, bnbCurrencyKey, 1000, []);
  });

  it("cannot liquidate position even if delay is passed if C-ratio is restored", async () => {
    // Alice gets marked for liquidation
    await setBnbPrice(350);
    await stack.lnLiquidation
      .connect(bob)
      .markPositionAsUndercollateralizedByCurrency(alice.address, bnbCurrencyKey);
    await passLiquidationDelay();

    // C-ratio restored but mark is not removed
    await setBnbPrice(1000);

    // Position cannot be liquidated now
    await expect(
      stack.lnLiquidation.connect(bob).liquidateCollateralPosition(alice.address, bnbCurrencyKey, 1000, [])
    ).to.be.revertedWith("LnLiquidation: not undercollateralized");

    // C-ratio falls below issuance ratio
    await setBnbPrice(90);

    // Position can now be liquidated
    await stack.lnLiquidation
      .connect(bob)
      .liquidateCollateralPosition(alice.address, bnbCurrencyKey, 1000, []);
  });

  it("can liquidate up to the amount to restore C-ratio to issuance ratio", async () => {
    // Alice gets marked for liquidation
    await setBnbPrice(350);
    await stack.lnLiquidation
      .connect(bob)
      .markPositionAsUndercollateralizedByCurrency(alice.address, bnbCurrencyKey);
    await passLiquidationDelay();

    /**
     * Formula:
     *     Max lUSD to Burn = (Debt Balance - Collateral Value * Issuance Ratio) / (1 - (1 + Liquidation Reward) * Issuance Ratio)
     *
     * Calculation:
     *     Max lUSD to Burn = (20 - 350 * 0.1 * 0.2) / (1 - (1 + 0.15) * 0.2) = 16.883116883116883116
     */
    const maxLusdToBurn = BigNumber.from("16883116883116883116");

    // Burning 1 unit more lUSD fails
    await expect(
      stack.lnLiquidation
        .connect(bob)
        .liquidateCollateralPosition(alice.address, bnbCurrencyKey, maxLusdToBurn.add(1), [])
    ).to.be.revertedWith("LnLiquidation: burn amount too large");

    // Can burn exactly the max amount
    await stack.lnLiquidation
      .connect(bob)
      .liquidateCollateralPosition(alice.address, bnbCurrencyKey, maxLusdToBurn, []);

    // Mark is removed after buring the max amount
    expect(
      await stack.lnLiquidation.isPositionMarkedAsUndercollateralizedByCurrency(
        alice.address,
        bnbCurrencyKey
      )
    ).to.equal(false);
  });

  it("can burn max amount directly without specifying concrete amount", async () => {
    // Same as last case
    await setBnbPrice(350);
    await stack.lnLiquidation
      .connect(bob)
      .markPositionAsUndercollateralizedByCurrency(alice.address, bnbCurrencyKey);
    await passLiquidationDelay();

    await stack.lnLiquidation
      .connect(bob)
      .liquidateCollateralPositionMax(alice.address, bnbCurrencyKey, []);

    // Mark is removed after buring the max amount
    expect(
      await stack.lnLiquidation.isPositionMarkedAsUndercollateralizedByCurrency(
        alice.address,
        bnbCurrencyKey
      )
    ).to.equal(false);
  });
});
