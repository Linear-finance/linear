import { ethers, waffle, upgrades } from "hardhat";
import { expect, use } from "chai";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { DateTime } from "luxon";
import { expandTo18Decimals, uint256Max } from "./utilities";
import {
  getBlockDateTime,
  mineBlock,
  setNextBlockTimestamp,
} from "./utilities/timeTravel";

use(waffle.solidity);

describe("LnVaultFixedRewardPool", function () {
  let deployer: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress;

  let stakeToken: Contract, rewardToken: Contract, pool: Contract;

  let startTime: DateTime;

  let snapshotId: number;

  const assertUserStakeAmount = async (
    address: string,
    stakeAmount: number | BigNumber
  ): Promise<void> => {
    const userData = await pool.userData(address);
    expect(userData.stakeAmount).to.equal(stakeAmount);
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

  const assertClaimableReward = (
    timestamp: DateTime,
    address: string,
    amount: number | BigNumber
  ): Promise<void> => {
    return runAndRevert(async () => {
      await mineBlock(ethers.provider, timestamp);
      expect(await pool.getReward(address)).to.equal(amount);
    });
  };

  beforeEach(async () => {
    [deployer, alice, bob] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const LnVaultFixedRewardPool = await ethers.getContractFactory(
      "LnVaultFixedRewardPool"
    );

    startTime = (await getBlockDateTime(ethers.provider)).plus({ days: 1 });

    stakeToken = await MockERC20.deploy(
      "STAKE Token", // _name
      "STAKE", //Î_symbol
      18 // _decimals
    );
    rewardToken = await MockERC20.deploy(
      "REWARD Token", // _name
      "REWARD", // _symbol
      18 // _decimals
    );
    pool = await upgrades.deployProxy(
      LnVaultFixedRewardPool,
      [
        startTime.toSeconds(), // _startTime
        expandTo18Decimals(1), // _rewardPerSecond
        stakeToken.address, // _stakeToken
        rewardToken.address, // _rewardToken
      ],
      {
        initializer: "__LnVaultFixedRewardPool_init",
      }
    );

    await rewardToken.connect(deployer).mint(
      pool.address, // account
      expandTo18Decimals(1_000_000) // amount
    );

    for (const user of [alice, bob]) {
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

  it("cannot stake before start time", async () => {
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.minus({ seconds: 1 }).toSeconds()
    );
    await expect(
      pool.connect(alice).stake(expandTo18Decimals(1))
    ).to.be.revertedWith("LnVaultFixedRewardPool: pool not started");
  });

  it("can stake after start time", async () => {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await pool.connect(alice).stake(expandTo18Decimals(1));
  });

  it("staking should emit Staked event", async () => {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await expect(pool.connect(alice).stake(expandTo18Decimals(1)))
      .to.emit(pool, "Staked")
      .withArgs(
        alice.address, // staker
        stakeToken.address, // token
        expandTo18Decimals(1) // amount
      );
  });

  it("unstaking should emit Unstaked event", async () => {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await pool.connect(alice).stake(expandTo18Decimals(1));

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ days: 1 }).toSeconds()
    );
    await expect(pool.connect(alice).unstake(expandTo18Decimals(0.1)))
      .to.emit(pool, "Unstaked")
      .withArgs(
        alice.address, // staker
        stakeToken.address, // token
        expandTo18Decimals(0.1) // amount
      );
  });

  it("cannot unstake when staked amount is zero", async () => {
    // Cannot unstake without staking first
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await expect(
      pool.connect(alice).unstake(expandTo18Decimals(1))
    ).to.be.revertedWith("SafeMath: subtraction overflow");

    // Cannot unstake once all of the staked amount has been unstaked
    await pool.connect(alice).stake(expandTo18Decimals(1));
    await pool.connect(alice).unstake(expandTo18Decimals(1));
    await expect(
      pool.connect(alice).unstake(expandTo18Decimals(1))
    ).to.be.revertedWith("SafeMath: subtraction overflow");
  });

  it("token should be transferred on stake", async () => {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await expect(pool.connect(alice).stake(expandTo18Decimals(1)))
      .to.emit(stakeToken, "Transfer")
      .withArgs(
        alice.address, // from
        pool.address, // to
        expandTo18Decimals(1) // amount
      );

    expect(await stakeToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(9999)
    );
    expect(await stakeToken.balanceOf(pool.address)).to.equal(
      expandTo18Decimals(1)
    );
  });

  it("token should be transferred on unstake", async () => {
    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await pool.connect(alice).stake(expandTo18Decimals(1));

    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ days: 1 }).toSeconds()
    );
    await expect(pool.connect(alice).unstake(expandTo18Decimals(0.1)))
      .to.emit(stakeToken, "Transfer")
      .withArgs(
        pool.address, // from
        alice.address, // to
        expandTo18Decimals(0.1) // amount
      );

    expect(await stakeToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(9999.1)
    );
    expect(await stakeToken.balanceOf(pool.address)).to.equal(
      expandTo18Decimals(0.9)
    );
  });

  it("totalStakeAmount should track total staked amount", async () => {
    expect(await pool.totalStakeAmount()).to.equal(0);

    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await pool.connect(alice).stake(expandTo18Decimals(1));
    expect(await pool.totalStakeAmount()).to.equal(expandTo18Decimals(1));

    await pool.connect(bob).stake(expandTo18Decimals(3));
    expect(await pool.totalStakeAmount()).to.equal(expandTo18Decimals(4));

    await pool.connect(alice).unstake(expandTo18Decimals(0.1));
    expect(await pool.totalStakeAmount()).to.equal(expandTo18Decimals(3.9));
  });

  it("userData.stakeAmount should track user staked amount", async () => {
    await assertUserStakeAmount(alice.address, 0);
    await assertUserStakeAmount(bob.address, 0);

    await setNextBlockTimestamp(ethers.provider, startTime.toSeconds());
    await pool.connect(alice).stake(expandTo18Decimals(1));
    await assertUserStakeAmount(alice.address, expandTo18Decimals(1));
    await assertUserStakeAmount(bob.address, 0);

    await pool.connect(bob).stake(expandTo18Decimals(3));
    await assertUserStakeAmount(alice.address, expandTo18Decimals(1));
    await assertUserStakeAmount(bob.address, expandTo18Decimals(3));

    await pool.connect(alice).unstake(expandTo18Decimals(0.1));
    await assertUserStakeAmount(alice.address, expandTo18Decimals(0.9));
    await assertUserStakeAmount(bob.address, expandTo18Decimals(3));

    await pool.connect(alice).unstake(expandTo18Decimals(0.9));
    await assertUserStakeAmount(alice.address, 0);
    await assertUserStakeAmount(bob.address, expandTo18Decimals(3));
  });

  it("one staker should earn all rewards", async () => {
    // Alice stakes 1 day after start
    await setNextBlockTimestamp(ethers.provider, startTime.plus({ days: 1 }));
    await pool.connect(alice).stake(expandTo18Decimals(1));

    // The immediate reward amount is zero
    expect(await pool.getReward(alice.address)).to.equal(0);

    // Should earn all rewards from the first 10 seconds
    await assertClaimableReward(
      startTime.plus({ days: 1, seconds: 10 }),
      alice.address,
      expandTo18Decimals(10)
    );
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ days: 1, seconds: 10 })
    );
    await expect(pool.connect(alice).claimReward())
      .to.emit(pool, "RewardClaimed")
      .withArgs(
        alice.address, // staker
        rewardToken.address, // token
        expandTo18Decimals(10) // amount
      )
      .and.emit(rewardToken, "Transfer")
      .withArgs(
        pool.address, // from
        alice.address, // to
        expandTo18Decimals(10) // amount
      );

    // Should earn all rewards from the following 5 seconds
    await assertClaimableReward(
      startTime.plus({ days: 1, seconds: 15 }),
      alice.address,
      expandTo18Decimals(5)
    );
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ days: 1, seconds: 15 })
    );
    await expect(pool.connect(alice).claimReward())
      .to.emit(pool, "RewardClaimed")
      .withArgs(
        alice.address, // staker
        rewardToken.address, // token
        expandTo18Decimals(5) // amount
      )
      .and.emit(rewardToken, "Transfer")
      .withArgs(
        pool.address, // from
        alice.address, // to
        expandTo18Decimals(5) // amount
      );
  });

  it("proportional reward distribution for multiple stakers", async () => {
    // Assert helper for the current case
    const assertRewards = (
      timestamp: DateTime,
      aliceReward: number | BigNumber,
      bobReward: number | BigNumber
    ): Promise<void> => {
      return runAndRevert(async () => {
        await mineBlock(ethers.provider, timestamp);
        expect(await pool.getReward(alice.address)).to.equal(aliceReward);
        expect(await pool.getReward(bob.address)).to.equal(bobReward);
      });
    };

    // Alice stakes at start time
    await setNextBlockTimestamp(ethers.provider, startTime);
    await pool.connect(alice).stake(expandTo18Decimals(1));

    // Only Alice accurs rewards
    await assertRewards(
      startTime.plus({ seconds: 10 }),
      expandTo18Decimals(10),
      0
    );

    // Bob stakes so that he takes up 90% of the pool
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ seconds: 10 })
    );
    await pool.connect(bob).stake(expandTo18Decimals(9));

    // Bob takes 90% from the 10-second period
    await assertRewards(
      startTime.plus({ seconds: 20 }),
      expandTo18Decimals(11),
      expandTo18Decimals(9)
    );

    // Bob unstakes such that his share is the same as Alice's
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ seconds: 20 })
    );
    await pool.connect(bob).unstake(expandTo18Decimals(8));

    // Alice and Bob shares the rewards in half
    await assertRewards(
      startTime.plus({ seconds: 30 }),
      expandTo18Decimals(16),
      expandTo18Decimals(14)
    );

    // Bob unstakes everything such that Alice will earn all remaining rewards
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus({ seconds: 30 })
    );
    await pool.connect(bob).unstake(expandTo18Decimals(1));

    // Alice takes all the rewards
    await assertRewards(
      startTime.plus({ seconds: 40 }),
      expandTo18Decimals(26),
      expandTo18Decimals(14)
    );

    // We can't just naively make two transactions for claiming their rewards here
    // as the block time will be off for 1 second
    await runAndRevert(async () => {
      await setNextBlockTimestamp(
        ethers.provider,
        startTime.plus({ seconds: 40 })
      );
      await expect(pool.connect(alice).claimReward())
        .to.emit(pool, "RewardClaimed")
        .withArgs(
          alice.address, // staker
          rewardToken.address, // token
          expandTo18Decimals(26) // amount
        )
        .and.emit(rewardToken, "Transfer")
        .withArgs(
          pool.address, // from
          alice.address, // to
          expandTo18Decimals(26) // amount
        );
    });
    await runAndRevert(async () => {
      await setNextBlockTimestamp(
        ethers.provider,
        startTime.plus({ seconds: 40 })
      );
      await expect(pool.connect(bob).claimReward())
        .to.emit(pool, "RewardClaimed")
        .withArgs(
          bob.address, // staker
          rewardToken.address, // token
          expandTo18Decimals(14) // amount
        )
        .and.emit(rewardToken, "Transfer")
        .withArgs(
          pool.address, // from
          bob.address, // to
          expandTo18Decimals(14) // amount
        );
    });
  });
});
