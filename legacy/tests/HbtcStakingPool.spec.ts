import { ethers, waffle } from "hardhat";
import { expect, use } from "chai";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { DateTime, Duration } from "luxon";
import { expandTo18Decimals, uint256Max } from "./utilities";
import {
  getBlockDateTime,
  mineBlock,
  setNextBlockTimestamp,
} from "./utilities/timeTravel";

use(waffle.solidity);

describe("HbtcStakingPool", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress;

  let hbtcToken: Contract, hbtcStakingPool: Contract;

  const stakingDuration: Duration = Duration.fromObject({ weeks: 4 });

  let startTime: DateTime, endTime: DateTime;

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
    admin = deployer;

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const HbtcStakingPool = await ethers.getContractFactory("HbtcStakingPool");

    startTime = (await getBlockDateTime(ethers.provider)).plus({ days: 1 });
    endTime = startTime.plus(stakingDuration);

    hbtcToken = await MockERC20.deploy(
      "Huobi BTC", // _name
      "HBTC" // _symbol
    );

    hbtcStakingPool = await HbtcStakingPool.deploy(
      hbtcToken.address, // _poolToken
      startTime.toSeconds(), // _startTime
      endTime.toSeconds(), // _endTime
      expandTo18Decimals(200), // _maxStakeAmount: 200 HBTC
      expandTo18Decimals(20_000_000) // _totalRewardAmount: 20,000,000 LINA
    );

    // Mint 200 BTC to Alice and Bob
    await hbtcToken.connect(admin).mint(alice.address, expandTo18Decimals(200));
    await hbtcToken.connect(admin).mint(bob.address, expandTo18Decimals(200));

    // All users approve token spending
    await hbtcToken.connect(alice).approve(hbtcStakingPool.address, uint256Max);
    await hbtcToken.connect(bob).approve(hbtcStakingPool.address, uint256Max);
  });

  it("cannot stake before start time", async function () {
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.minus({ seconds: 1 }).toSeconds()
    );
    await expect(
      hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1))
    ).to.be.revertedWith("HbtcStakingPool: not started");
  });

  it("can stake after start time", async function () {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1));
  });

  it("cannot stake after end time", async function () {
    await setNextBlockTimestamp(ethers.provider, endTime.toSeconds());
    await expect(
      hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1))
    ).to.be.revertedWith("HbtcStakingPool: already ended");
  });

  it("can unstake after end time", async function () {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1));

    await setNextBlockTimestamp(ethers.provider, endTime.toSeconds());
    await hbtcStakingPool.connect(alice).unstake(expandTo18Decimals(1));
  });

  it("staking should emit Staked event", async function () {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await expect(hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1)))
      .to.emit(hbtcStakingPool, "Staked")
      .withArgs(alice.address, expandTo18Decimals(1), startTime.toSeconds());
  });

  it("unstaking should emit Unstaked event", async function () {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1));

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ days: 1 }).toSeconds()
    );
    await expect(
      hbtcStakingPool.connect(alice).unstake(expandTo18Decimals(0.1))
    )
      .to.emit(hbtcStakingPool, "Unstaked")
      .withArgs(
        alice.address,
        expandTo18Decimals(0.1),
        startTime.plus({ days: 1 }).toSeconds()
      );

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ days: 2 }).toSeconds()
    );
    await expect(hbtcStakingPool.connect(alice).unstakeAll())
      .to.emit(hbtcStakingPool, "Unstaked")
      .withArgs(
        alice.address,
        expandTo18Decimals(0.9),
        startTime.plus({ days: 2 }).toSeconds()
      );
  });

  it("cannot unstake when staked amount is zero", async function () {
    // Cannot unstake without staking first
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await expect(
      hbtcStakingPool.connect(alice).unstake(expandTo18Decimals(1))
    ).to.be.revertedWith("SafeMath: subtraction overflow");

    // Cannot unstake once all of the staked amount has been unstaked
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1));
    await hbtcStakingPool.connect(alice).unstake(expandTo18Decimals(1));
    await expect(
      hbtcStakingPool.connect(alice).unstake(expandTo18Decimals(1))
    ).to.be.revertedWith("SafeMath: subtraction overflow");
  });

  it("cannot stake over maximum", async function () {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(150));

    // Just a little bit over max amount
    await expect(
      hbtcStakingPool.connect(bob).stake(expandTo18Decimals(50).add(1))
    ).to.be.revertedWith("HbtcStakingPool: maximum stake amount exceeded");

    // It's OK to stake to max amount
    await hbtcStakingPool.connect(bob).stake(expandTo18Decimals(50));
  });

  it("token should be transferred on stake", async function () {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await expect(hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1)))
      .to.emit(hbtcToken, "Transfer")
      .withArgs(alice.address, hbtcStakingPool.address, expandTo18Decimals(1));

    expect(await hbtcToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(199)
    );
    expect(await hbtcToken.balanceOf(hbtcStakingPool.address)).to.equal(
      expandTo18Decimals(1)
    );
  });

  it("token should be transferred on unstake", async function () {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1));

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ days: 1 }).toSeconds()
    );
    await expect(
      hbtcStakingPool.connect(alice).unstake(expandTo18Decimals(0.1))
    )
      .to.emit(hbtcToken, "Transfer")
      .withArgs(
        hbtcStakingPool.address,
        alice.address,
        expandTo18Decimals(0.1)
      );

    expect(await hbtcToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(199.1)
    );
    expect(await hbtcToken.balanceOf(hbtcStakingPool.address)).to.equal(
      expandTo18Decimals(0.9)
    );

    await expect(hbtcStakingPool.connect(alice).unstakeAll())
      .to.emit(hbtcToken, "Transfer")
      .withArgs(
        hbtcStakingPool.address,
        alice.address,
        expandTo18Decimals(0.9)
      );

    expect(await hbtcToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(200)
    );
    expect(await hbtcToken.balanceOf(hbtcStakingPool.address)).to.equal(0);
  });

  it("totalStakeAmount should track total staked amount", async function () {
    expect(await hbtcStakingPool.totalStakeAmount()).to.equal(0);

    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1));
    expect(await hbtcStakingPool.totalStakeAmount()).to.equal(
      expandTo18Decimals(1)
    );

    await hbtcStakingPool.connect(bob).stake(expandTo18Decimals(3));
    expect(await hbtcStakingPool.totalStakeAmount()).to.equal(
      expandTo18Decimals(4)
    );

    await hbtcStakingPool.connect(alice).unstake(expandTo18Decimals(0.1));
    expect(await hbtcStakingPool.totalStakeAmount()).to.equal(
      expandTo18Decimals(3.9)
    );
  });

  it("stakeAmounts should track user staked amount", async function () {
    expect(await hbtcStakingPool.stakeAmounts(alice.address)).to.equal(0);
    expect(await hbtcStakingPool.stakeAmounts(bob.address)).to.equal(0);

    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1));
    expect(await hbtcStakingPool.stakeAmounts(alice.address)).to.equal(
      expandTo18Decimals(1)
    );
    expect(await hbtcStakingPool.stakeAmounts(bob.address)).to.equal(0);

    await hbtcStakingPool.connect(bob).stake(expandTo18Decimals(3));
    expect(await hbtcStakingPool.stakeAmounts(alice.address)).to.equal(
      expandTo18Decimals(1)
    );
    expect(await hbtcStakingPool.stakeAmounts(bob.address)).to.equal(
      expandTo18Decimals(3)
    );

    await hbtcStakingPool.connect(alice).unstake(expandTo18Decimals(0.1));
    expect(await hbtcStakingPool.stakeAmounts(alice.address)).to.equal(
      expandTo18Decimals(0.9)
    );
    expect(await hbtcStakingPool.stakeAmounts(bob.address)).to.equal(
      expandTo18Decimals(3)
    );

    await hbtcStakingPool.connect(alice).unstakeAll();
    expect(await hbtcStakingPool.stakeAmounts(alice.address)).to.equal(0);
    expect(await hbtcStakingPool.stakeAmounts(bob.address)).to.equal(
      expandTo18Decimals(3)
    );
  });

  /**
   * Fuzzy matches are used as there are extremely small rounding errors regarding rewards
   */
  it("one staker should earn all rewards", async function () {
    // Alice stakes one week after start
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ weeks: 1 }).toSeconds()
    );
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1));

    // The immediate reward amount is zero
    expect(await hbtcStakingPool.getReward(alice.address)).to.equal(0);

    // Should earn 1/4 of the total reward after 1 week
    await mineBlock(ethers.provider, startTime.plus({ weeks: 2 }).toSeconds());
    expect(await hbtcStakingPool.getReward(alice.address))
      .to.be.gte(expandTo18Decimals(5_000_000).sub(1))
      .and.lte(expandTo18Decimals(5_000_000).add(1));

    // Should earn another 1/4 of the total reward after 2 weeks
    await mineBlock(ethers.provider, startTime.plus({ weeks: 3 }).toSeconds());
    expect(await hbtcStakingPool.getReward(alice.address))
      .to.be.gte(expandTo18Decimals(10_000_000).sub(1))
      .and.lte(expandTo18Decimals(10_000_000).add(1));

    // Reward is capped at endTime
    await mineBlock(ethers.provider, startTime.plus({ year: 1 }).toSeconds());
    expect(await hbtcStakingPool.getReward(alice.address))
      .to.be.gte(expandTo18Decimals(15_000_000).sub(1))
      .and.lte(expandTo18Decimals(15_000_000).add(1));
  });

  /**
   * Fuzzy matches are used as there are extremely small rounding errors regarding rewards
   */
  it("proportional reward distribution for multiple stakers", async function () {
    // Alice stakes at start time
    await setNextBlockTimestamp(ethers.provider, startTime);
    await hbtcStakingPool.connect(alice).stake(expandTo18Decimals(1));

    // Bob stakes 1 week after
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ weeks: 1 }).toSeconds()
    );
    await hbtcStakingPool.connect(bob).stake(expandTo18Decimals(9));

    // Bob has accurred any reward just yet
    expect(await hbtcStakingPool.getReward(alice.address))
      .to.be.gte(expandTo18Decimals(5_000_000).sub(5))
      .and.lte(expandTo18Decimals(5_000_000).add(5));
    expect(await hbtcStakingPool.getReward(bob.address)).to.equal(0);

    // After 1 week, Bob unstakes such that his share is the same as Alice's
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ weeks: 2 }).toSeconds()
    );
    await hbtcStakingPool.connect(bob).unstake(expandTo18Decimals(8));

    // Bob takes 90% of reward for the past week
    expect(await hbtcStakingPool.getReward(alice.address))
      .to.be.gte(expandTo18Decimals(5_500_000).sub(5))
      .and.lte(expandTo18Decimals(5_500_000).add(5));
    expect(await hbtcStakingPool.getReward(bob.address))
      .to.be.gte(expandTo18Decimals(4_500_000).sub(5))
      .and.lte(expandTo18Decimals(4_500_000).add(5));

    // After 1 week, Bob unstakes everything such that Alice will earn all remaining rewards
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ weeks: 3 }).toSeconds()
    );
    await hbtcStakingPool.connect(bob).unstakeAll();

    // Alice and Bob both take half of the reward from the past week
    expect(await hbtcStakingPool.getReward(alice.address))
      .to.be.gte(expandTo18Decimals(8_000_000).sub(5))
      .and.lte(expandTo18Decimals(8_000_000).add(5));
    expect(await hbtcStakingPool.getReward(bob.address))
      .to.be.gte(expandTo18Decimals(7_000_000).sub(5))
      .and.lte(expandTo18Decimals(7_000_000).add(5));

    // Alice takes all reward from the final week
    await mineBlock(ethers.provider, startTime.plus({ weeks: 4 }).toSeconds());
    expect(await hbtcStakingPool.getReward(alice.address))
      .to.be.gte(expandTo18Decimals(13_000_000).sub(5))
      .and.lte(expandTo18Decimals(13_000_000).add(5));
    expect(await hbtcStakingPool.getReward(bob.address))
      .to.be.gte(expandTo18Decimals(7_000_000).sub(5))
      .and.lte(expandTo18Decimals(7_000_000).add(5));

    // No more reward accumulation after endTime
    await mineBlock(ethers.provider, startTime.plus({ year: 1 }).toSeconds());
    expect(await hbtcStakingPool.getReward(alice.address))
      .to.be.gte(expandTo18Decimals(13_000_000).sub(5))
      .and.lte(expandTo18Decimals(13_000_000).add(5));
    expect(await hbtcStakingPool.getReward(bob.address))
      .to.be.gte(expandTo18Decimals(7_000_000).sub(5))
      .and.lte(expandTo18Decimals(7_000_000).add(5));
  });
});
