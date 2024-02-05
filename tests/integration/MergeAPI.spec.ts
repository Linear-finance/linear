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
    await stack.linaToken.connect(admin).mint(
      alice.address, // account
      expandTo18Decimals(10_000) // amounts
    );
    await stack.linaToken.connect(alice).approve(
      stack.lnCollateralSystem.address, // spender
      expandTo18Decimals(10_000) // amount
    );
  });

  it("can stake without building", async function () {
    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10_000)
    );
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(0);

    // Alice can stake LINA without building lUSD
    await expect(
      stack.lnCollateralSystem.connect(alice).stakeAndBuild(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        expandTo18Decimals(10_000), // stakeAmount
        0 // buildAmount
      )
    )
      .to.emit(stack.lnCollateralSystem, "CollateralLog")
      .and.not.emit(stack.lnDebtSystem, "PushDebtLog");

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(0);

    expect(
      await stack.lnCollateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.lnDebtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(0);
  });

  it("can build without staking", async function () {
    await stack.lnCollateralSystem.connect(alice).stakeAndBuild(
      ethers.utils.formatBytes32String("LINA"), // stakeCurrency
      expandTo18Decimals(10_000), // stakeAmount
      0 // buildAmount
    );

    await expect(
      stack.lnCollateralSystem.connect(alice).stakeAndBuild(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        0, // stakeAmount
        expandTo18Decimals(10) // buildAmount
      )
    )
      .to.emit(stack.lnDebtSystem, "PushDebtLog")
      .and.not.emit(stack.lnCollateralSystem, "CollateralLog");

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.lnCollateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.lnDebtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can stake and build atomically", async function () {
    await expect(
      stack.lnCollateralSystem.connect(alice).stakeAndBuild(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        expandTo18Decimals(10_000), // stakeAmount
        expandTo18Decimals(10) // buildAmount
      )
    )
      .to.emit(stack.lnCollateralSystem, "CollateralLog")
      .and.emit(stack.lnDebtSystem, "PushDebtLog");

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.lnCollateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.lnDebtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can stake and build max atomically", async function () {
    // lUSD = 10,000 * 0.01 * 0.2 = 20
    await expect(
      stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
        ethers.utils.formatBytes32String("LINA"), // stakeCurrency
        expandTo18Decimals(10_000) // stakeAmount
      )
    )
      .to.emit(stack.lnCollateralSystem, "CollateralLog")
      .and.emit(stack.lnDebtSystem, "PushDebtLog");

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(20)
    );

    expect(
      await stack.lnCollateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.lnDebtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(20));
  });

  it("can burn without unstaking", async function () {
    // Alice stakes 10,000 LINA and builds 20 lUSD
    await stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
      ethers.utils.formatBytes32String("LINA"), // stakeCurrency
      expandTo18Decimals(10_000) // stakeAmount
    );

    await expect(
      stack.lnCollateralSystem.connect(alice).burnAndUnstake(
        expandTo18Decimals(10), // burnAmount
        ethers.utils.formatBytes32String("LINA"), // unstakeCurrency
        0 // unstakeAmount
      )
    )
      .to.emit(stack.lnDebtSystem, "PushDebtLog")
      .and.not.emit(stack.lnCollateralSystem, "RedeemCollateral");

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(0);
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.lnCollateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(10_000));
    expect(
      (
        await stack.lnDebtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can unstake without burning", async function () {
    // Alice stakes 10,000 LINA and builds 10 lUSD
    await stack.lnCollateralSystem.connect(alice).stakeAndBuild(
      ethers.utils.formatBytes32String("LINA"), // stakeCurrency
      expandTo18Decimals(10_000), // stakeAmount
      expandTo18Decimals(10) // buildAmount
    );

    await expect(
      stack.lnCollateralSystem.connect(alice).burnAndUnstake(
        0, // burnAmount
        ethers.utils.formatBytes32String("LINA"), // unstakeCurrency
        expandTo18Decimals(4_000) // unstakeAmount
      )
    )
      .to.emit(stack.lnCollateralSystem, "RedeemCollateral")
      .and.not.emit(stack.lnDebtSystem, "PushDebtLog");

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(4_000)
    );
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.lnCollateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(6_000));
    expect(
      (
        await stack.lnDebtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can burn and unstake atomically", async function () {
    // Alice stakes 10,000 LINA and builds 20 lUSD
    await stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
      ethers.utils.formatBytes32String("LINA"), // stakeCurrency
      expandTo18Decimals(10_000) // stakeAmount
    );

    await expect(
      stack.lnCollateralSystem.connect(alice).burnAndUnstake(
        expandTo18Decimals(10), // burnAmount
        ethers.utils.formatBytes32String("LINA"), // unstakeCurrency
        expandTo18Decimals(2_000) // unstakeAmount
      )
    )
      .to.emit(stack.lnDebtSystem, "PushDebtLog")
      .and.emit(stack.lnCollateralSystem, "RedeemCollateral");

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(2_000)
    );
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10)
    );

    expect(
      await stack.lnCollateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(8_000));
    expect(
      (
        await stack.lnDebtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(10));
  });

  it("can burn and unstake max atomically", async function () {
    // Alice stakes 10,000 LINA and builds 20 lUSD
    await stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
      ethers.utils.formatBytes32String("LINA"), // stakeCurrency
      expandTo18Decimals(10_000) // stakeAmount
    );

    await expect(
      stack.lnCollateralSystem.connect(alice).burnAndUnstakeMax(
        expandTo18Decimals(5), // burnAmount
        ethers.utils.formatBytes32String("LINA") // unstakeCurrency
      )
    )
      .to.emit(stack.lnDebtSystem, "PushDebtLog")
      .and.emit(stack.lnCollateralSystem, "RedeemCollateral");

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(2_500)
    );
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(15)
    );

    expect(
      await stack.lnCollateralSystem.GetUserCollateral(
        alice.address, // _user
        ethers.utils.formatBytes32String("LINA") // _currency
      )
    ).to.equal(expandTo18Decimals(7_500));
    expect(
      (
        await stack.lnDebtSystem.GetUserDebtBalanceInUsd(
          alice.address // _user
        )
      )[0]
    ).to.equal(expandTo18Decimals(15));
  });
});
