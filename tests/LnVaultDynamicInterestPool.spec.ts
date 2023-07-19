import { ethers, waffle, upgrades } from "hardhat";
import { expect, use } from "chai";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { DateTime, Duration } from "luxon";
import { expandTo18Decimals, uint256Max } from "./utilities";
import {
  getBlockDateTime,
  mineBlock,
  setNextBlockTimestamp,
} from "./utilities/timeTravel";

use(waffle.solidity);

describe("LnVaultDynamicInterestPool", function () {
  let deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress;

  let stakeToken: Contract, interestToken: Contract, pool: Contract;

  const periodDuration: Duration = Duration.fromObject({
    days: 7,
  });

  let startTime: DateTime;

  let snapshotId: number;

  const multiplyDuration = (count: number): Duration => {
    return Duration.fromMillis(periodDuration.as("milliseconds") * count);
  };

  const withdrawInterestWithAssertion = (
    user: SignerWithAddress,
    periodId: number,
    principal: BigNumber | number,
    interestRate: BigNumber | number,
    interest: BigNumber | number
  ): Promise<void> => {
    return expect(
      pool.connect(user).withdrawInterest(
        periodId // periodId
      )
    )
      .to.emit(pool, "InterestWithdrawn")
      .withArgs(
        user.address, // user
        periodId, // periodId
        principal, // principal
        interestRate, // interestRate
        interest // interest
      )
      .and.emit(interestToken, "Transfer")
      .withArgs(
        pool.address, // from
        user.address, // to
        interest // amount
      );
  };

  const captureSnapshot = async (): Promise<void> => {
    snapshotId = await ethers.provider.send("evm_snapshot", []);
  };

  const restoreSnapshot = async (): Promise<void> => {
    await ethers.provider.send("evm_revert", [snapshotId]);
  };

  const runAndRevert = async (runner: () => Promise<void>): Promise<void> => {
    await captureSnapshot();
    await runner();
    await restoreSnapshot();
  };

  const assertWithdrawablePrincipal = (
    timestamp: DateTime,
    address: string,
    amount: number | BigNumber
  ): Promise<void> => {
    return runAndRevert(async () => {
      await mineBlock(ethers.provider, timestamp);
      expect(await pool.getWithdrawablePrincipal(address)).to.equal(amount);
    });
  };

  const assertWithdrawableInterests = (
    timestamp: DateTime,
    address: string,
    fromPeriodId: number,
    toPeriodId: number,
    amount: number | BigNumber
  ): Promise<void> => {
    return runAndRevert(async () => {
      await mineBlock(ethers.provider, timestamp);
      const withdrawables = await pool.getWithdrawableInterests(
        address // user
      );
      expect(withdrawables.fromPeriodId).to.equal(fromPeriodId);
      expect(withdrawables.toPeriodId).to.equal(toPeriodId);
      expect(withdrawables.amount).to.equal(amount);
    });
  };

  beforeEach(async function () {
    [deployer, alice, bob, charlie] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const LnVaultDynamicInterestPool = await ethers.getContractFactory(
      "LnVaultDynamicInterestPool"
    );

    startTime = (await getBlockDateTime(ethers.provider)).plus({ days: 1 });

    stakeToken = await MockERC20.deploy(
      "STAKE Token", // _name
      "STAKE", //Î_symbol
      18 // _decimals
    );
    interestToken = await MockERC20.deploy(
      "INTEREST Token", // _name
      "INTEREST", // _symbol
      18 // _decimals
    );
    pool = await upgrades.deployProxy(
      LnVaultDynamicInterestPool,
      [
        startTime.toSeconds(), // _firstPeriodStartTime
        periodDuration.as("seconds"), // _periodDuration
        expandTo18Decimals(2_500), // _totalSubscriptionLimit
        expandTo18Decimals(1_000), // _userSubscriptionLimit
        stakeToken.address, // _stakeToken
        interestToken.address, // _interestToken
      ],
      {
        initializer: "__LnVaultDynamicInterestPool_init",
      }
    );

    await interestToken.connect(deployer).mint(
      pool.address, // account
      expandTo18Decimals(1_000_000) // amount
    );

    for (const user of [alice, bob, charlie]) {
      await stakeToken.connect(deployer).mint(
        user.address, // account
        expandTo18Decimals(10_000) // amount
      );
      await stakeToken.connect(user).approve(
        pool.address, // spender
        uint256Max // amount
      );
    }
  });

  it("cannot subscribe more than user subscription limit", async () => {
    await expect(
      pool.connect(alice).subscribe(
        expandTo18Decimals(1_000).add(1) // amount
      )
    ).to.be.revertedWith("LnVaultDynamicInterestPool: user oversubscribed");

    await pool.connect(alice).subscribe(
      expandTo18Decimals(1_000) // amount
    );

    await expect(
      pool.connect(alice).subscribe(
        1 // amount
      )
    ).to.be.revertedWith("LnVaultDynamicInterestPool: user oversubscribed");
  });

  it("cannot subscribe more than total subscription limit", async () => {
    await pool.connect(alice).subscribe(
      expandTo18Decimals(1_000) // amount
    );
    await pool.connect(bob).subscribe(
      expandTo18Decimals(1_000) // amount
    );

    await expect(
      pool.connect(charlie).subscribe(
        expandTo18Decimals(500).add(1) // amount
      )
    ).to.be.revertedWith("LnVaultDynamicInterestPool: total oversubscribed");
  });

  it("amount subscribed before start should earn interest for the first period", async () => {
    await pool.connect(alice).subscribe(
      expandTo18Decimals(1000) // amount
    );

    await pool.connect(deployer).setInterestRate(
      1, // periodId
      expandTo18Decimals(0.01) // interestRate
    );

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(periodDuration)
    );

    // Interest = 1000 * 1% = 10
    await withdrawInterestWithAssertion(
      alice, // user
      1, // periodId
      expandTo18Decimals(1_000), // principal
      expandTo18Decimals(0.01), // interestRate
      expandTo18Decimals(10) // interest
    );
  });

  it("amount subscribed in any period should earn interest in the next period", async () => {
    // In period 2
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(periodDuration)
    );

    await pool.connect(deployer).setInterestRate(
      2, // periodId
      expandTo18Decimals(0.02) // interestRate
    );
    await pool.connect(deployer).setInterestRate(
      3, // periodId
      expandTo18Decimals(0.03) // interestRate
    );

    await pool.connect(alice).subscribe(
      expandTo18Decimals(1000) // amount
    );

    // In period 4
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(multiplyDuration(3))
    );

    // No interest for period 2
    await expect(
      pool.connect(alice).withdrawInterest(
        2 // periodId
      )
    ).to.be.revertedWith("LnVaultDynamicInterestPool: invalid period id");

    // Interest = 1000 * 3% = 30
    await withdrawInterestWithAssertion(
      alice, // user
      3, // periodId
      expandTo18Decimals(1_000), // principal
      expandTo18Decimals(0.03), // interestRate
      expandTo18Decimals(30) // interest
    );
  });

  it("subscription amount addition should not affect interests until next period", async () => {
    await pool.connect(deployer).setInterestRate(
      2, // periodId
      expandTo18Decimals(0.02) // interestRate
    );
    await pool.connect(deployer).setInterestRate(
      3, // periodId
      expandTo18Decimals(0.03) // interestRate
    );

    // Subscribe 500 in period 1
    await setNextBlockTimestamp(ethers.provider, startTime);
    await pool.connect(alice).subscribe(
      expandTo18Decimals(500) // amount
    );

    // Add 200 in period 2
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(multiplyDuration(1))
    );
    await pool.connect(alice).subscribe(
      expandTo18Decimals(200) // amount
    );

    await assertWithdrawableInterests(
      startTime.plus(multiplyDuration(3)),
      alice.address,
      2,
      3,
      expandTo18Decimals(31)
    );

    // Period 2 principal excludes 200
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(multiplyDuration(2))
    );
    await withdrawInterestWithAssertion(
      alice, // user
      2, // periodId
      expandTo18Decimals(500), // principal
      expandTo18Decimals(0.02), // interestRate
      expandTo18Decimals(10) // interest
    );

    // Period 3 principal includes 200
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(multiplyDuration(3))
    );
    await withdrawInterestWithAssertion(
      alice, // user
      3, // periodId
      expandTo18Decimals(700), // principal
      expandTo18Decimals(0.03), // interestRate
      expandTo18Decimals(21) // interest
    );
  });

  it("subscription amount removal should not affect interests until next period", async () => {
    await pool.connect(deployer).setInterestRate(
      2, // periodId
      expandTo18Decimals(0.02) // interestRate
    );
    await pool.connect(deployer).setInterestRate(
      3, // periodId
      expandTo18Decimals(0.03) // interestRate
    );

    // Subscribe 500 in period 1
    await setNextBlockTimestamp(ethers.provider, startTime);
    await pool.connect(alice).subscribe(
      expandTo18Decimals(500) // amount
    );

    // Remove 200 in period 2
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(multiplyDuration(1))
    );
    await pool.connect(alice).unsubscribe(
      expandTo18Decimals(200) // amount
    );

    await assertWithdrawableInterests(
      startTime.plus(multiplyDuration(3)),
      alice.address,
      2,
      3,
      expandTo18Decimals(19)
    );

    // Period 2 principal still includes 200
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(multiplyDuration(2))
    );
    await withdrawInterestWithAssertion(
      alice, // user
      2, // periodId
      expandTo18Decimals(500), // principal
      expandTo18Decimals(0.02), // interestRate
      expandTo18Decimals(10) // interest
    );

    // Period 3 principal excludes the 200 removed
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(multiplyDuration(3))
    );
    await withdrawInterestWithAssertion(
      alice, // user
      3, // periodId
      expandTo18Decimals(300), // principal
      expandTo18Decimals(0.03), // interestRate
      expandTo18Decimals(9) // interest
    );
  });

  it("amount unsubscribe before start is locked until the first period starts", async () => {
    await pool.connect(alice).subscribe(
      expandTo18Decimals(1_000) // amount
    );

    expect(await stakeToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(9_000)
    );
    expect(await stakeToken.balanceOf(pool.address)).to.equal(
      expandTo18Decimals(1_000)
    );

    await expect(
      pool.connect(alice).unsubscribe(
        expandTo18Decimals(1_000) // amount
      )
    )
      .to.emit(pool, "Unsubscribed")
      .withArgs(
        alice.address, // user
        0, // periodId
        expandTo18Decimals(1_000) // amount
      );

    expect(await stakeToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(9_000)
    );
    expect(await stakeToken.balanceOf(pool.address)).to.equal(
      expandTo18Decimals(1_000)
    );

    await assertWithdrawablePrincipal(
      startTime.minus({
        seconds: 1,
      }),
      alice.address,
      0
    );

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.minus({
        seconds: 1,
      })
    );
    await expect(pool.connect(alice).withdrawPrincipal()).to.be.revertedWith(
      "LnVaultDynamicInterestPool: refund still pending"
    );

    await assertWithdrawablePrincipal(
      startTime,
      alice.address,
      expandTo18Decimals(1_000)
    );

    await setNextBlockTimestamp(ethers.provider, startTime);
    await expect(pool.connect(alice).withdrawPrincipal())
      .to.emit(stakeToken, "Transfer")
      .withArgs(
        pool.address, // from
        alice.address, // to
        expandTo18Decimals(1_000) // amount
      );

    expect(await stakeToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10_000)
    );
    expect(await stakeToken.balanceOf(pool.address)).to.equal(0);
  });

  it("amount unsubscribe in any period should not be withdrawable until the next period starts", async () => {
    await pool.connect(alice).subscribe(
      expandTo18Decimals(1_000) // amount
    );

    // Unsubscribe 300 in period 1
    await setNextBlockTimestamp(ethers.provider, startTime);
    await pool.connect(alice).unsubscribe(
      expandTo18Decimals(300) // amount
    );

    await assertWithdrawablePrincipal(
      startTime.plus(periodDuration).minus({ seconds: 1 }),
      alice.address,
      0
    );

    // Cannot withdraw before period 1 ends
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(periodDuration).minus({ seconds: 1 })
    );
    await expect(pool.connect(alice).withdrawPrincipal()).to.be.revertedWith(
      "LnVaultDynamicInterestPool: refund still pending"
    );

    await assertWithdrawablePrincipal(
      startTime.plus(periodDuration),
      alice.address,
      expandTo18Decimals(300)
    );

    // Can withdraw when period 1 ends
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(periodDuration)
    );
    await expect(pool.connect(alice).withdrawPrincipal())
      .to.emit(stakeToken, "Transfer")
      .withArgs(
        pool.address, // from
        alice.address, // to
        expandTo18Decimals(300) // amount
      );
  });

  it("cannot claim interest until period ends", async () => {
    await pool.connect(deployer).setInterestRate(
      1, // periodId
      expandTo18Decimals(0.01) // interestRate
    );

    await pool.connect(alice).subscribe(
      expandTo18Decimals(1_000) // amount
    );

    await assertWithdrawableInterests(
      startTime.plus(periodDuration).minus({ seconds: 1 }),
      alice.address,
      0,
      0,
      0
    );

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(periodDuration).minus({ seconds: 1 })
    );
    await expect(
      pool.connect(alice).withdrawInterest(
        1 // periodId
      )
    ).to.be.revertedWith("LnVaultDynamicInterestPool: period not ended");

    await assertWithdrawableInterests(
      startTime.plus(periodDuration),
      alice.address,
      1,
      1,
      expandTo18Decimals(10)
    );

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(periodDuration)
    );
    await withdrawInterestWithAssertion(
      alice, // user
      1, // periodId
      expandTo18Decimals(1_000), // principal
      expandTo18Decimals(0.01), // interestRate
      expandTo18Decimals(10) // interest
    );
  });

  it("cannot claim interest before rate is set", async () => {
    await pool.connect(alice).subscribe(
      expandTo18Decimals(1_000) // amount
    );

    await assertWithdrawableInterests(
      startTime.plus(periodDuration),
      alice.address,
      0,
      0,
      0
    );

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(periodDuration)
    );
    await expect(
      pool.connect(alice).withdrawInterest(
        1 // periodId
      )
    ).to.be.revertedWith("LnVaultDynamicInterestPool: interest rate not set");

    await pool.connect(deployer).setInterestRate(
      1, // periodId
      expandTo18Decimals(0.01) // interestRate
    );

    await assertWithdrawableInterests(
      startTime.plus(periodDuration).plus({ minutes: 5 }),
      alice.address,
      1,
      1,
      expandTo18Decimals(10)
    );

    await withdrawInterestWithAssertion(
      alice, // user
      1, // periodId
      expandTo18Decimals(1_000), // principal
      expandTo18Decimals(0.01), // interestRate
      expandTo18Decimals(10) // interest
    );
  });

  it("cannot skip periods when claiming interests", async () => {
    await pool.connect(deployer).setInterestRate(
      1, // periodId
      expandTo18Decimals(0.01) // interestRate
    );
    await pool.connect(deployer).setInterestRate(
      2, // periodId
      expandTo18Decimals(0.02) // interestRate
    );

    await pool.connect(alice).subscribe(
      expandTo18Decimals(1_000) // amount
    );

    await assertWithdrawableInterests(
      startTime.plus(multiplyDuration(2)),
      alice.address,
      1,
      2,
      expandTo18Decimals(30)
    );

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(multiplyDuration(2))
    );

    // Cannot claim period 2 since period 1 is not claimed yet
    await expect(
      pool.connect(alice).withdrawInterest(
        2 // periodId
      )
    ).to.be.revertedWith("LnVaultDynamicInterestPool: invalid period id");

    // Can claim period 2 after claiming period 1
    await withdrawInterestWithAssertion(
      alice, // user
      1, // periodId
      expandTo18Decimals(1_000), // principal
      expandTo18Decimals(0.01), // interestRate
      expandTo18Decimals(10) // interest
    );
    await withdrawInterestWithAssertion(
      alice, // user
      2, // periodId
      expandTo18Decimals(1_000), // principal
      expandTo18Decimals(0.02), // interestRate
      expandTo18Decimals(20) // interest
    );
  });

  it("can withdraw interests for multiple periods at once", async () => {
    await pool.connect(deployer).setInterestRate(
      1, // periodId
      expandTo18Decimals(0.01) // interestRate
    );
    await pool.connect(deployer).setInterestRate(
      2, // periodId
      expandTo18Decimals(0.02) // interestRate
    );

    await pool.connect(alice).subscribe(
      expandTo18Decimals(1_000) // amount
    );

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(multiplyDuration(2))
    );

    await expect(
      pool.connect(alice).withdrawInterests(
        1, // fromPeriodId
        2 // toPeriodId
      )
    )
      .to.emit(pool, "InterestWithdrawn")
      .withArgs(
        alice.address, // user
        1, // periodId
        expandTo18Decimals(1_000), // principal
        expandTo18Decimals(0.01), // interestRate
        expandTo18Decimals(10) // interest
      )
      .and.emit(interestToken, "Transfer")
      .withArgs(
        pool.address, // from
        alice.address, // to
        expandTo18Decimals(10) // amount
      )
      .and.emit(pool, "InterestWithdrawn")
      .withArgs(
        alice.address, // user
        2, // periodId
        expandTo18Decimals(1_000), // principal
        expandTo18Decimals(0.02), // interestRate
        expandTo18Decimals(20) // interest
      )
      .and.emit(interestToken, "Transfer")
      .withArgs(
        pool.address, // from
        alice.address, // to
        expandTo18Decimals(10) // amount
      );
  });
});
