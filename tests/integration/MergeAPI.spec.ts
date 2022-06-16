import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expandTo18Decimals, nullAddress } from "../utilities";
import { DeployedStack, deployLinearStack } from "../utilities/init";
import { formatBytes32String, formatEther } from "ethers/lib/utils";

describe("Integration | Merge API: Stake/Build and Burn/Unstake", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress;

  let stack: DeployedStack;

  const linaCurrencyKey = formatBytes32String("LINA");
  const bnbCurrencyKey = formatBytes32String("BNB");

  beforeEach(async function () {
    [deployer, alice] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);

    // Set LINA price to $0.01
    await stack.lnPrices.connect(admin).setPrice(
      linaCurrencyKey, // currencyKey
      expandTo18Decimals(0.01) // price
    );

    // Set BNB price to $250
    await stack.lnPrices.connect(admin).setPrice(
      bnbCurrencyKey, // currencyKey
      expandTo18Decimals(250) // price
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

  describe("With ERC20 tokens", function () {
    it("can stake without building", async function () {
      expect(await stack.linaToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(10_000)
      );
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(0);

      // Alice can stake LINA without building lUSD
      await expect(
        stack.lnCollateralSystem.connect(alice).stakeAndBuild(
          linaCurrencyKey, // stakeCurrency
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
          linaCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10_000));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            linaCurrencyKey
          )
        )[0]
      ).to.equal(0);
    });

    it("can build without staking", async function () {
      await stack.lnCollateralSystem.connect(alice).stakeAndBuild(
        linaCurrencyKey, // stakeCurrency
        expandTo18Decimals(10_000), // stakeAmount
        0 // buildAmount
      );

      await expect(
        stack.lnCollateralSystem.connect(alice).stakeAndBuild(
          linaCurrencyKey, // stakeCurrency
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
          linaCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10_000));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            linaCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(10));
    });

    it("can stake and build atomically", async function () {
      await expect(
        stack.lnCollateralSystem.connect(alice).stakeAndBuild(
          linaCurrencyKey, // stakeCurrency
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
          linaCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10_000));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            linaCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(10));
    });

    it("can stake and build max atomically", async function () {
      // lUSD = 10,000 * 0.01 * 0.2 = 20
      await expect(
        stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
          linaCurrencyKey, // stakeCurrency
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
          linaCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10_000));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            linaCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(20));
    });

    it("can burn without unstaking", async function () {
      // Alice stakes 10,000 LINA and builds 20 lUSD
      await stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
        linaCurrencyKey, // stakeCurrency
        expandTo18Decimals(10_000) // stakeAmount
      );

      await expect(
        stack.lnCollateralSystem.connect(alice).burnAndUnstake(
          expandTo18Decimals(10), // burnAmount
          linaCurrencyKey, // unstakeCurrency
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
          linaCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10_000));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            linaCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(10));
    });

    it("can unstake without burning", async function () {
      // Alice stakes 10,000 LINA and builds 10 lUSD
      await stack.lnCollateralSystem.connect(alice).stakeAndBuild(
        linaCurrencyKey, // stakeCurrency
        expandTo18Decimals(10_000), // stakeAmount
        expandTo18Decimals(10) // buildAmount
      );

      await expect(
        stack.lnCollateralSystem.connect(alice).burnAndUnstake(
          0, // burnAmount
          linaCurrencyKey, // unstakeCurrency
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
          linaCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(6_000));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            linaCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(10));
    });

    it("can burn and unstake atomically", async function () {
      // Alice stakes 10,000 LINA and builds 20 lUSD
      await stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
        linaCurrencyKey, // stakeCurrency
        expandTo18Decimals(10_000) // stakeAmount
      );

      await expect(
        stack.lnCollateralSystem.connect(alice).burnAndUnstake(
          expandTo18Decimals(10), // burnAmount
          linaCurrencyKey, // unstakeCurrency
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
          linaCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(8_000));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            linaCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(10));
    });

    it("can burn and unstake max atomically", async function () {
      // Alice stakes 10,000 LINA and builds 20 lUSD
      await stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
        linaCurrencyKey, // stakeCurrency
        expandTo18Decimals(10_000) // stakeAmount
      );

      await expect(
        stack.lnCollateralSystem.connect(alice).burnAndUnstakeMax(
          expandTo18Decimals(5), // burnAmount
          linaCurrencyKey // unstakeCurrency
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
          linaCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(7_500));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            linaCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(15));
    });
  })

  describe("With native tokens", function () {
    beforeEach(async function () {
      await stack.lnCollateralSystem.connect(admin).UpdateTokenInfo(
        bnbCurrencyKey, // _currency
        nullAddress, // _tokenAddr
        expandTo18Decimals(1), // _minCollateral
        false // _close
      );
    });

    it("can stake without building", async function () {
      const bnbBalanceBefore = await ethers.provider.getBalance(alice.address);
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(0);

      // Alice can stake BNB without building lUSD
      await expect(
        stack.lnCollateralSystem.connect(alice).stakeAndBuild(
          bnbCurrencyKey, // stakeCurrency
          expandTo18Decimals(10), // stakeAmount
          0, // buildAmount
          {
            value: expandTo18Decimals(10)
          }
        )
      )
        .to.emit(stack.lnCollateralSystem, "CollateralLog")
        .and.not.emit(stack.lnDebtSystem, "PushDebtLog");

      const bnbBalanceAfter = await ethers.provider.getBalance(alice.address);
      const bnbUsed = bnbBalanceBefore.sub(bnbBalanceAfter);
      expect(Number(formatEther(bnbUsed))).to.be.closeTo(10, 0.01);
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(0);

      expect(
        await stack.lnCollateralSystem.GetUserCollateral(
          alice.address, // _user
          bnbCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            bnbCurrencyKey
          )
        )[0]
      ).to.equal(0);
    });

    it("can build without staking", async function () {
      await stack.lnCollateralSystem.connect(alice).stakeAndBuild(
        bnbCurrencyKey, // stakeCurrency
        expandTo18Decimals(10), // stakeAmount
        0, // buildAmount
        {
          value: expandTo18Decimals(10)
        }
      );

      await expect(
        stack.lnCollateralSystem.connect(alice).stakeAndBuild(
          bnbCurrencyKey, // stakeCurrency
          0, // stakeAmount
          expandTo18Decimals(1) // buildAmount
        )
      )
        .to.emit(stack.lnDebtSystem, "PushDebtLog")
        .and.not.emit(stack.lnCollateralSystem, "CollateralLog");

      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(1)
      );

      expect(
        await stack.lnCollateralSystem.GetUserCollateral(
          alice.address, // _user
          bnbCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            bnbCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(1));
    });

    it("can stake and build atomically", async function () {
      const bnbBalanceBefore = await ethers.provider.getBalance(alice.address);
      await expect(
        stack.lnCollateralSystem.connect(alice).stakeAndBuild(
          bnbCurrencyKey, // stakeCurrency
          expandTo18Decimals(10), // stakeAmount
          expandTo18Decimals(1), // buildAmount
          {
            value: expandTo18Decimals(10)
          }
        )
      )
        .to.emit(stack.lnCollateralSystem, "CollateralLog")
        .and.emit(stack.lnDebtSystem, "PushDebtLog");

      const bnbBalanceAfter = await ethers.provider.getBalance(alice.address);
      const bnbUsed = bnbBalanceBefore.sub(bnbBalanceAfter);
      expect(Number(formatEther(bnbUsed))).to.be.closeTo(10, 0.01);
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(1)
      );

      expect(
        await stack.lnCollateralSystem.GetUserCollateral(
          alice.address, // _user
          bnbCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            bnbCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(1));
    });

    it("can stake and build max atomically", async function () {
      // lUSD = 10 * 250 * 0.3 = 750
      const bnbBalanceBefore = await ethers.provider.getBalance(alice.address);

      await expect(
        stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
          bnbCurrencyKey, // stakeCurrency
          expandTo18Decimals(10), // stakeAmount
          {
            value: expandTo18Decimals(10)
          }
        )
      )
        .to.emit(stack.lnCollateralSystem, "CollateralLog")
        .and.emit(stack.lnDebtSystem, "PushDebtLog");

      const bnbBalanceAfter = await ethers.provider.getBalance(alice.address);
      const bnbUsed = bnbBalanceBefore.sub(bnbBalanceAfter);
      expect(Number(formatEther(bnbUsed))).to.be.closeTo(10, 0.01);
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(750)
      );

      expect(
        await stack.lnCollateralSystem.GetUserCollateral(
          alice.address, // _user
          bnbCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            bnbCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(750));
    });

    it("can burn without unstaking", async function () {
      // Alice stakes 10 BNB and builds 750 lUSD
      const bnbBalanceBefore = await ethers.provider.getBalance(alice.address);

      await stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
        bnbCurrencyKey, // stakeCurrency
        expandTo18Decimals(10), // stakeAmount
        {
          value: expandTo18Decimals(10)
        }
      );

      await expect(
        stack.lnCollateralSystem.connect(alice).burnAndUnstake(
          expandTo18Decimals(10), // burnAmount
          bnbCurrencyKey, // unstakeCurrency
          0 // unstakeAmount
        )
      )
        .to.emit(stack.lnDebtSystem, "PushDebtLog")
        .and.not.emit(stack.lnCollateralSystem, "RedeemCollateral");

      const bnbBalanceAfter = await ethers.provider.getBalance(alice.address);
      const bnbUsed = bnbBalanceBefore.sub(bnbBalanceAfter);
      expect(Number(formatEther(bnbUsed))).to.be.closeTo(10, 0.01);
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(740)
      );

      expect(
        await stack.lnCollateralSystem.GetUserCollateral(
          alice.address, // _user
          bnbCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(10));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            bnbCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(740));
    });

    it("can unstake without burning", async function () {
      // Alice stakes 10,000 LINA and builds 10 lUSD
      await stack.lnCollateralSystem.connect(alice).stakeAndBuild(
        bnbCurrencyKey, // stakeCurrency
        expandTo18Decimals(10), // stakeAmount
        expandTo18Decimals(10), // buildAmount
        {
          value: expandTo18Decimals(10)
        }
      );

      const bnbBalanceBefore = await ethers.provider.getBalance(alice.address);

      await expect(
        stack.lnCollateralSystem.connect(alice).burnAndUnstake(
          0, // burnAmount
          bnbCurrencyKey, // unstakeCurrency
          expandTo18Decimals(4) // unstakeAmount
        )
      )
        .to.emit(stack.lnCollateralSystem, "RedeemCollateral")
        .and.not.emit(stack.lnDebtSystem, "PushDebtLog");

      const bnbBalanceAfter = await ethers.provider.getBalance(alice.address);
      const bnbUsed = bnbBalanceAfter.sub(bnbBalanceBefore);
      expect(Number(formatEther(bnbUsed))).to.be.closeTo(4, 0.05);

      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(10)
      );

      expect(
        await stack.lnCollateralSystem.GetUserCollateral(
          alice.address, // _user
          bnbCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(6));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            bnbCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(10));
    });

    it("can burn and unstake atomically", async function () {
      // Alice stakes 10 BNB and builds 750 lUSD
      await stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
        bnbCurrencyKey, // stakeCurrency
        expandTo18Decimals(10), // stakeAmount
        {
          value: expandTo18Decimals(10)
        }
      );

      const bnbBalanceBefore = await ethers.provider.getBalance(alice.address);

      await expect(
        stack.lnCollateralSystem.connect(alice).burnAndUnstake(
          expandTo18Decimals(375), // burnAmount
          bnbCurrencyKey, // unstakeCurrency
          expandTo18Decimals(2) // unstakeAmount
        )
      )
        .to.emit(stack.lnDebtSystem, "PushDebtLog")
        .and.emit(stack.lnCollateralSystem, "RedeemCollateral");

      const bnbBalanceAfter = await ethers.provider.getBalance(alice.address);
      const bnbUsed = bnbBalanceAfter.sub(bnbBalanceBefore);
      expect(Number(formatEther(bnbUsed))).to.be.closeTo(2, 0.05);

      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(375)
      );

      expect(
        await stack.lnCollateralSystem.GetUserCollateral(
          alice.address, // _user
          bnbCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(8));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            bnbCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(375));
    });

    it("can burn and unstake max atomically", async function () {
      // Alice stakes 10 BNB and builds 750 lUSD
      await stack.lnCollateralSystem.connect(alice).stakeAndBuildMax(
        bnbCurrencyKey, // stakeCurrency
        expandTo18Decimals(10), // stakeAmount
        {
          value: expandTo18Decimals(10)
        }
      );

      const bnbBalanceBefore = await ethers.provider.getBalance(alice.address);

      await expect(
        stack.lnCollateralSystem.connect(alice).burnAndUnstakeMax(
          expandTo18Decimals(187.5), // burnAmount
          bnbCurrencyKey // unstakeCurrency
        )
      )
        .to.emit(stack.lnDebtSystem, "PushDebtLog")
        .and.emit(stack.lnCollateralSystem, "RedeemCollateral");

      const bnbBalanceAfter = await ethers.provider.getBalance(alice.address);
      const bnbUsed = bnbBalanceAfter.sub(bnbBalanceBefore);
      expect(Number(formatEther(bnbUsed))).to.be.closeTo(2.5, 0.05);
      expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(562.5)
      );

      expect(
        await stack.lnCollateralSystem.GetUserCollateral(
          alice.address, // _user
          bnbCurrencyKey // _currency
        )
      ).to.equal(expandTo18Decimals(7.5));
      expect(
        (
          await stack.lnDebtSystem.GetUserDebtBalanceInUsdByCurrency(
            alice.address, // _user
            bnbCurrencyKey // _currency
          )
        )[0]
      ).to.equal(expandTo18Decimals(562.5));
    });
  })
});
