import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expandTo18Decimals } from "../utilities";
import { DeployedStack, deployLinearStack } from "../utilities/init";

describe("Integration | Merge API: Stake/Build and Burn/Unstake", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress;

  let stack: DeployedStack;

  beforeEach(async function () {
    [deployer, alice] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);

    // Set LINA price to $0.01
    await stack.lnPrices.connect(admin).setPrice(
      ethers.utils.formatBytes32String("LINA"), // currencyKey
      expandTo18Decimals(0.01) // price
    );

    // Mint and approve 10,000 LINA for Alice
    await stack.collaterals.lina.token.connect(admin).mint(
      alice.address, // account
      expandTo18Decimals(10_000) // amounts
    );
    await stack.collaterals.lina.token.connect(alice).approve(
      stack.collaterals.lina.collateralSystem.address, // spender
      expandTo18Decimals(10_000) // amount
    );
  });

  it("can stake without building", async function () {
    expect(
      await stack.collaterals.lina.token.balanceOf(alice.address)
    ).to.equal(expandTo18Decimals(10_000));
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(0);

    // Alice can stake LINA without building lUSD
    await expect(
      stack.collaterals.lina.collateralSystem.connect(alice).stakeAndBuild(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        expandTo18Decimals(10_000), // stakeAmount
        0 // buildAmount
      )
    )
      .to.emit(stack.collaterals.lina.collateralSystem, "CollateralLog")
      .and.not.emit(stack.collaterals.lina.debtSystem, "PushDebtLog");

    expect(
      await stack.collaterals.lina.token.balanceOf(alice.address)
    ).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(0);

    expect(
      await stack.collaterals.lina.collateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.collaterals.lina.debtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(0);
  });

  it("can build without staking", async function () {
    await stack.collaterals.lina.collateralSystem.connect(alice).stakeAndBuild(
      ethers.utils.formatBytes32String("LINA"), // stakeCurrency
      expandTo18Decimals(10_000), // stakeAmount
      0 // buildAmount
    );

    await expect(
      stack.collaterals.lina.collateralSystem.connect(alice).stakeAndBuild(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        0, // stakeAmount
        expandTo18Decimals(10) // buildAmount
      )
    )
      .to.emit(stack.collaterals.lina.debtSystem, "PushDebtLog")
      .and.not.emit(stack.collaterals.lina.collateralSystem, "CollateralLog");

    expect(
      await stack.collaterals.lina.token.balanceOf(alice.address)
    ).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.collaterals.lina.collateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.collaterals.lina.debtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can stake and build atomically", async function () {
    await expect(
      stack.collaterals.lina.collateralSystem.connect(alice).stakeAndBuild(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        expandTo18Decimals(10_000), // stakeAmount
        expandTo18Decimals(10) // buildAmount
      )
    )
      .to.emit(stack.collaterals.lina.collateralSystem, "CollateralLog")
      .and.emit(stack.collaterals.lina.debtSystem, "PushDebtLog");

    expect(
      await stack.collaterals.lina.token.balanceOf(alice.address)
    ).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.collaterals.lina.collateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.collaterals.lina.debtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can stake and build max atomically", async function () {
    // lUSD = 10,000 * 0.01 * 0.2 = 20
    await expect(
      stack.collaterals.lina.collateralSystem.connect(alice).stakeAndBuildMax(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        expandTo18Decimals(10_000) // stakeAmount
      )
    )
      .to.emit(stack.collaterals.lina.collateralSystem, "CollateralLog")
      .and.emit(stack.collaterals.lina.debtSystem, "PushDebtLog");

    expect(
      await stack.collaterals.lina.token.balanceOf(alice.address)
    ).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(20)
    );

    expect(
      await stack.collaterals.lina.collateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.collaterals.lina.debtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(20));
  });

  it("can burn without unstaking", async function () {
    // Alice stakes 10,000 LINA and builds 20 lUSD
    await stack.collaterals.lina.collateralSystem
      .connect(alice)
      .stakeAndBuildMax(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        expandTo18Decimals(10_000) // stakeAmount
      );

    await expect(
      stack.collaterals.lina.collateralSystem.connect(alice).burnAndUnstake(
        expandTo18Decimals(10), // burnAmount
        ethers.utils.formatBytes32String("LINA"), // unstakeCurrency
        0 // unstakeAmount
      )
    )
      .to.emit(stack.collaterals.lina.debtSystem, "PushDebtLog")
      .and.not.emit(
        stack.collaterals.lina.collateralSystem,
        "RedeemCollateral"
      );

    expect(
      await stack.collaterals.lina.token.balanceOf(alice.address)
    ).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.collaterals.lina.collateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.collaterals.lina.debtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can unstake without burning", async function () {
    // Alice stakes 10,000 LINA and builds 10 lUSD
    await stack.collaterals.lina.collateralSystem.connect(alice).stakeAndBuild(
      ethers.utils.formatBytes32String("LINA"), // stakeCurrency
      expandTo18Decimals(10_000), // stakeAmount
      expandTo18Decimals(10) // buildAmount
    );

    await expect(
      stack.collaterals.lina.collateralSystem.connect(alice).burnAndUnstake(
        0, // burnAmount
        ethers.utils.formatBytes32String("LINA"), // unstakeCurrency
        expandTo18Decimals(4_000) // unstakeAmount
      )
    )
      .to.emit(stack.collaterals.lina.collateralSystem, "RedeemCollateral")
      .and.not.emit(stack.collaterals.lina.debtSystem, "PushDebtLog");

    expect(
      await stack.collaterals.lina.token.balanceOf(alice.address)
    ).to.equal(expandTo18Decimals(4_000));
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.collaterals.lina.collateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(6_000));
    expect(
      (
        await stack.collaterals.lina.debtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can burn and unstake atomically", async function () {
    // Alice stakes 10,000 LINA and builds 20 lUSD
    await stack.collaterals.lina.collateralSystem
      .connect(alice)
      .stakeAndBuildMax(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        expandTo18Decimals(10_000) // stakeAmount
      );

    await expect(
      stack.collaterals.lina.collateralSystem.connect(alice).burnAndUnstake(
        expandTo18Decimals(10), // burnAmount
        ethers.utils.formatBytes32String("LINA"), // unstakeCurrency
        expandTo18Decimals(2_000) // unstakeAmount
      )
    )
      .to.emit(stack.collaterals.lina.debtSystem, "PushDebtLog")
      .and.emit(stack.collaterals.lina.collateralSystem, "RedeemCollateral");

    expect(
      await stack.collaterals.lina.token.balanceOf(alice.address)
    ).to.equal(expandTo18Decimals(2_000));
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.collaterals.lina.collateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(8_000));
    expect(
      (
        await stack.collaterals.lina.debtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can burn and unstake max atomically", async function () {
    // Alice stakes 10,000 LINA and builds 20 lUSD
    await stack.collaterals.lina.collateralSystem
      .connect(alice)
      .stakeAndBuildMax(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        expandTo18Decimals(10_000) // stakeAmount
      );

    await expect(
      stack.collaterals.lina.collateralSystem.connect(alice).burnAndUnstakeMax(
        expandTo18Decimals(5), // burnAmount
        ethers.utils.formatBytes32String("LINA") // unstakeCurrency
      )
    )
      .to.emit(stack.collaterals.lina.debtSystem, "PushDebtLog")
      .and.emit(stack.collaterals.lina.collateralSystem, "RedeemCollateral");

    expect(
      await stack.collaterals.lina.token.balanceOf(alice.address)
    ).to.equal(expandTo18Decimals(2_500));
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(15)
    );

    expect(
      await stack.collaterals.lina.collateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(7_500));
    expect(
      (
        await stack.collaterals.lina.debtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(15));
  });
});
