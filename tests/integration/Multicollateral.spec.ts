import { Duration } from "luxon";
import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumberish } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import {
  expandTo18Decimals,
  expandTo8Decimals,
  uint256Max,
} from "../utilities";
import { deployLinearStack, DeployedStack } from "../utilities/init";
import {
  getBlockDateTime,
  setNextBlockTimestamp,
} from "../utilities/timeTravel";

import { ILnDebtSystem } from "../../typechain";

const { formatBytes32String } = ethers.utils;

enum CollateralType {
  LINA,
  WBTC,
}

describe("Integration | Multicollateral", function () {
  let deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress;

  let stack: DeployedStack;

  const setLinaPrice = async (price: number): Promise<void> => {
    await stack.lnPrices.connect(deployer).setPrice(
      ethers.utils.formatBytes32String("LINA"), // currencyKey
      expandTo18Decimals(price) // price
    );
  };

  const setWbtcPrice = async (price: number): Promise<void> => {
    await stack.lnPrices.connect(deployer).setPrice(
      ethers.utils.formatBytes32String("WBTC"), // currencyKey
      expandTo18Decimals(price) // price
    );
  };

  const assertDebtBalance = async (
    user: string,
    collateral: CollateralType,
    amount: BigNumberish
  ) => {
    let debtSystem: ILnDebtSystem;
    switch (collateral) {
      case CollateralType.LINA:
        debtSystem = stack.collaterals.lina.debtSystem as ILnDebtSystem;
        break;
      case CollateralType.WBTC:
        debtSystem = stack.collaterals.wbtc.debtSystem as ILnDebtSystem;
        break;
      default:
        throw new Error("Unknown collateral type");
    }
    expect((await debtSystem.GetUserDebtBalanceInUsd(user))[0]).to.equal(
      amount
    );
  };

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();

    stack = await deployLinearStack(deployer, deployer);

    // Set LINA price to $0.01
    await setLinaPrice(0.01);
    // Set WBTC price to $20,000
    await setWbtcPrice(20_000);

    // Mint 1,000,000 LINA and 10 WBTC to Alice
    await stack.collaterals.lina.token
      .connect(deployer)
      .mint(alice.address, expandTo18Decimals(1_000_000));
    await stack.collaterals.wbtc.token
      .connect(deployer)
      .mint(alice.address, expandTo8Decimals(10));

    await stack.collaterals.lina.token
      .connect(alice)
      .approve(stack.collaterals.lina.collateralSystem.address, uint256Max);
    await stack.collaterals.wbtc.token
      .connect(alice)
      .approve(stack.collaterals.wbtc.collateralSystem.address, uint256Max);
  });

  describe("Collateral Staking", function () {
    it("can stake and unstake WBTC", async function () {
      // Alice has 10 WBTC
      expect(
        await stack.collaterals.wbtc.token.balanceOf(alice.address)
      ).to.equal(expandTo8Decimals(10));
      expect(
        await stack.collaterals.wbtc.token.balanceOf(
          stack.collaterals.wbtc.collateralSystem.address
        )
      ).to.equal(0);

      // Alice stakes 3 WBTC
      await stack.collaterals.wbtc.collateralSystem.connect(alice).Collateral(
        formatBytes32String("WBTC"), // _currency
        expandTo8Decimals(3) // _amount
      );
      expect(
        await stack.collaterals.wbtc.token.balanceOf(alice.address)
      ).to.equal(expandTo8Decimals(7));
      expect(
        await stack.collaterals.wbtc.token.balanceOf(
          stack.collaterals.wbtc.collateralSystem.address
        )
      ).to.equal(expandTo8Decimals(3));

      // Alice unstakes 1 WBTC
      await stack.collaterals.wbtc.collateralSystem.connect(alice).Redeem(
        formatBytes32String("WBTC"), // _currency
        expandTo8Decimals(1) // _amount
      );
      expect(
        await stack.collaterals.wbtc.token.balanceOf(alice.address)
      ).to.equal(expandTo8Decimals(8));
      expect(
        await stack.collaterals.wbtc.token.balanceOf(
          stack.collaterals.wbtc.collateralSystem.address
        )
      ).to.equal(expandTo8Decimals(2));

      // Alice unstakes everything
      await stack.collaterals.wbtc.collateralSystem.connect(alice).RedeemMax(
        formatBytes32String("WBTC") // _currency
      );
      expect(
        await stack.collaterals.wbtc.token.balanceOf(alice.address)
      ).to.equal(expandTo8Decimals(10));
      expect(
        await stack.collaterals.wbtc.token.balanceOf(
          stack.collaterals.wbtc.collateralSystem.address
        )
      ).to.equal(0);
    });
  });

  describe("Building lUSD", function () {
    beforeEach(async function () {
      // Alice stakes 10,000 LINA
      await stack.collaterals.lina.collateralSystem.connect(alice).Collateral(
        formatBytes32String("LINA"), // _currency
        expandTo18Decimals(10_000) // _amount
      );

      // Alice stakes 1 WBTC
      await stack.collaterals.wbtc.collateralSystem.connect(alice).Collateral(
        formatBytes32String("WBTC"), // _currency
        expandTo8Decimals(1) // _amount
      );
    });

    it("can build lUSD with WBTC collateral", async function () {
      // Maximun amount of lUSD Alice can build:
      //
      // 1 * 20000 * 0.5 = 10000 lUSD
      //
      // Trying to build 10001 lUSD will fail
      await expect(
        stack.collaterals.wbtc.buildBurnSystem.connect(alice).BuildAsset(
          expandTo18Decimals(10_001) // amount
        )
      ).to.revertedWith("Build amount too big, you need more collateral");

      // Building 10000 lUSD works
      await stack.collaterals.wbtc.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(10_000) // amount
      );

      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(10_000)
      );
    });

    it("LINA balances should not affect building from WBTC", async function () {
      // Alice gets 10,000 LINA locked balance (she already has 10,000 LINA staked)
      await stack.lnRewardLocker.connect(deployer).migrateRewards(
        [alice.address], // _users
        [expandTo18Decimals(10_000)], // _amounts
        [
          (await getBlockDateTime(ethers.provider))
            .plus({ years: 1 })
            .toSeconds(),
        ] // _lockTo
      );

      // Alice can still only build 10,000 lUSD
      await expect(
        stack.collaterals.wbtc.buildBurnSystem.connect(alice).BuildAsset(
          expandTo18Decimals(10_001) // amount
        )
      ).to.revertedWith("Build amount too big, you need more collateral");
      await stack.collaterals.wbtc.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(10_000) // amount
      );
    });

    it("lUSD from different collaterals are fungible", async function () {
      // Alice has no lUSD to begin with
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(0);

      // Alice builds 10 lUSD from LINA
      await stack.collaterals.lina.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(10) // amount
      );

      // lUSD token balance increases
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(10)
      );

      // Alice builds 20 lUSD from WBTC
      await stack.collaterals.wbtc.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(20) // amount
      );

      // The same lUSD token balance increases
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(30)
      );
    });

    it("debt from different collaterals are separated", async function () {
      // Alice has no debt on either side to begin with
      await assertDebtBalance(alice.address, CollateralType.LINA, 0);
      await assertDebtBalance(alice.address, CollateralType.WBTC, 0);

      // Alice builds 10 lUSD from LINA
      await stack.collaterals.lina.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(10) // amount
      );

      // LINA debt increases
      await assertDebtBalance(
        alice.address,
        CollateralType.LINA,
        expandTo18Decimals(10)
      );
      await assertDebtBalance(alice.address, CollateralType.WBTC, 0);

      // Alice builds 20 lUSD from WBTC
      await stack.collaterals.wbtc.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(20) // amount
      );

      // WBTC debt increases
      await assertDebtBalance(
        alice.address,
        CollateralType.LINA,
        expandTo18Decimals(10)
      );
      await assertDebtBalance(
        alice.address,
        CollateralType.WBTC,
        expandTo18Decimals(20)
      );
    });
  });

  describe("Debt Changes", function () {
    const settlementDelay: Duration = Duration.fromObject({ minutes: 1 });

    // Helper functions
    const setLbtcPrice = async (price: number): Promise<void> => {
      await stack.lnPrices.connect(deployer).setPrice(
        ethers.utils.formatBytes32String("lBTC"), // currencyKey
        expandTo18Decimals(price) // price
      );
    };
    const passSettlementDelay = async (): Promise<void> => {
      await setNextBlockTimestamp(
        ethers.provider,
        (await getBlockDateTime(ethers.provider)).plus(settlementDelay)
      );
    };
    const settleTrade = (entryId: number): Promise<any> => {
      return stack.lnExchangeSystem.connect(deployer).settle(
        entryId // pendingExchangeEntryId
      );
    };
    const settleTradeWithDelay = async (entryId: number): Promise<any> => {
      await passSettlementDelay();
      await settleTrade(entryId);
    };

    beforeEach(async function () {
      // Alice stakes 10,000 LINA and 1 WBTC
      await stack.collaterals.lina.collateralSystem.connect(alice).Collateral(
        formatBytes32String("LINA"), // _currency
        expandTo18Decimals(10_000) // _amount
      );
      await stack.collaterals.wbtc.collateralSystem.connect(alice).Collateral(
        formatBytes32String("WBTC"), // _currency
        expandTo8Decimals(1) // _amount
      );

      // Alice builds 10 lUSD from LINA and 20 lUSD from WBTC
      await stack.collaterals.lina.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(10) // amount
      );
      await stack.collaterals.wbtc.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(20) // amount
      );

      // Set settlement delay
      await stack.lnConfig.connect(deployer).setUint(
        formatBytes32String("TradeSettlementDelay"), // key
        settlementDelay.as("seconds")
      );
      await stack.lnConfig.connect(deployer).setUint(
        formatBytes32String("TradeRevertDelay"), // key
        Duration.fromObject({ years: 1 }).as("seconds")
      );

      // Set lBTC price to $20,000
      await setLbtcPrice(20_000);

      // Alice exchanges 10 lUSD for 0.0005 lBTC
      await stack.lnExchangeSystem.connect(alice).exchange(
        formatBytes32String("lUSD"), // sourceKey
        expandTo18Decimals(10), // sourceAmount
        alice.address, // destAddr
        formatBytes32String("lBTC") // destKey
      );
      await settleTradeWithDelay(1);
    });

    it("exchanging should not affect debt amounts", async function () {
      await assertDebtBalance(
        alice.address,
        CollateralType.LINA,
        expandTo18Decimals(10)
      );
      await assertDebtBalance(
        alice.address,
        CollateralType.WBTC,
        expandTo18Decimals(20)
      );
    });

    it("debt should increase proportionally across collaterals", async function () {
      // Set lBTC price to $80,000
      await setLbtcPrice(80_000);

      // Total debt now:
      //   20 lUSD
      //   0.0005 lBTC = 0.0005 * 80,000 = 40 lUSD
      //   Total = 20 + 40 = 60 lUSD
      //
      // Per collateral:
      //   LINA: 20 lUSD
      //   WBTC: 40 lUSD
      await assertDebtBalance(
        alice.address,
        CollateralType.LINA,
        expandTo18Decimals(20)
      );
      await assertDebtBalance(
        alice.address,
        CollateralType.WBTC,
        expandTo18Decimals(40)
      );
    });

    it("debt should decrease proportionally across collaterals", async function () {
      // Set lBTC price to $2,000
      await setLbtcPrice(2_000);

      // Total debt now:
      //   20 lUSD
      //   0.0005 lBTC = 0.0005 * 2,000 = 1 lUSD
      //   Total = 20 + 1 = 21 lUSD
      //
      // Per collateral:
      //   LINA: 7 lUSD
      //   WBTC: 14 lUSD
      await assertDebtBalance(
        alice.address,
        CollateralType.LINA,
        expandTo18Decimals(7)
      );
      await assertDebtBalance(
        alice.address,
        CollateralType.WBTC,
        expandTo18Decimals(14)
      );
    });

    it("burning debt works after debt changes from exchange", async function () {
      // Set lBTC price to $2,000 so that debt per collateral:
      //   LINA: 7 lUSD
      //   WBTC: 14 lUSD
      await setLbtcPrice(2_000);
      await assertDebtBalance(
        alice.address,
        CollateralType.LINA,
        expandTo18Decimals(7)
      );
      await assertDebtBalance(
        alice.address,
        CollateralType.WBTC,
        expandTo18Decimals(14)
      );

      // Alice burns 2 lUSD of LINA debt
      await stack.collaterals.lina.buildBurnSystem
        .connect(alice)
        .BurnAsset(expandTo18Decimals(2));
      await assertDebtBalance(
        alice.address,
        CollateralType.LINA,
        expandTo18Decimals(5)
      );
      await assertDebtBalance(
        alice.address,
        CollateralType.WBTC,
        expandTo18Decimals(14)
      );

      // Alice burns 4 lUSD of WBTC debt
      await stack.collaterals.wbtc.buildBurnSystem
        .connect(alice)
        .BurnAsset(expandTo18Decimals(4));
      await assertDebtBalance(
        alice.address,
        CollateralType.LINA,
        expandTo18Decimals(5)
      );
      await assertDebtBalance(
        alice.address,
        CollateralType.WBTC,
        expandTo18Decimals(10)
      );
    });
  });

  describe("Liquidation", function () {
    beforeEach(async function () {
      // Set LINA price to $0.1 and WBTC price to $20,000
      await setLinaPrice(0.1);
      await setWbtcPrice(20_000);

      // Alice stakes 1,000 LINA and 1 WBTC
      await stack.collaterals.lina.collateralSystem.connect(alice).Collateral(
        formatBytes32String("LINA"), // _currency
        expandTo18Decimals(1_000) // _amount
      );
      await stack.collaterals.wbtc.collateralSystem.connect(alice).Collateral(
        formatBytes32String("WBTC"), // _currency
        expandTo8Decimals(1) // _amount
      );

      // Alice builds 20 lUSD from LINA and 20 lUSD from WBTC
      await stack.collaterals.lina.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(20) // amount
      );
      await stack.collaterals.wbtc.buildBurnSystem.connect(alice).BuildAsset(
        expandTo18Decimals(20) // amount
      );
    });

    it("WBTC debt position can be marked for liquidation", async function () {
      // Price of WBTC changes to $40 such that WBTC C-ratio becomes 200%
      await setWbtcPrice(40);

      // Can't mark Alice's position as it's not *below* liquidation ratio
      await expect(
        stack.collaterals.wbtc.liquidation
          .connect(bob)
          .markPositionAsUndercollateralized(alice.address)
      ).to.be.revertedWith("Liquidation: not undercollateralized");

      // Price of WBTC drops such that C-ratio falls below liquidation ratio
      await setWbtcPrice(39.9);

      // Can mark position normally
      await expect(
        stack.collaterals.wbtc.liquidation
          .connect(bob)
          .markPositionAsUndercollateralized(alice.address)
      )
        .to.emit(stack.collaterals.wbtc.liquidation, "PositionMarked")
        .withArgs(
          alice.address, // user
          bob.address // marker
        );

      // Confirm mark
      expect(
        await stack.collaterals.wbtc.liquidation.isPositionMarkedAsUndercollateralized(
          alice.address
        )
      ).to.equal(true);
      expect(
        await stack.collaterals.wbtc.liquidation.getUndercollateralizationMarkMarker(
          alice.address
        )
      ).to.equal(bob.address);
    });

    it("can't mark LINA position when only WBTC position is undercollateralized", async function () {
      // WBTC price drops
      await setWbtcPrice(39.9);

      // Can only mark WBTC
      await stack.collaterals.wbtc.liquidation
        .connect(bob)
        .markPositionAsUndercollateralized(alice.address);
      await expect(
        stack.collaterals.lina.liquidation
          .connect(bob)
          .markPositionAsUndercollateralized(alice.address)
      ).to.be.revertedWith("Liquidation: not undercollateralized");
    });

    it("can't mark WBTC position when only LINA position is undercollateralized", async function () {
      // LINA price drops
      await setLinaPrice(0.01);

      // Can only mark LINA
      await stack.collaterals.lina.liquidation
        .connect(bob)
        .markPositionAsUndercollateralized(alice.address);
      await expect(
        stack.collaterals.wbtc.liquidation
          .connect(bob)
          .markPositionAsUndercollateralized(alice.address)
      ).to.be.revertedWith("Liquidation: not undercollateralized");
    });
  });
});
