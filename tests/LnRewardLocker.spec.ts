import { ethers, waffle } from "hardhat";
import { expect, use } from "chai";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import {
  setNextBlockTimestamp,
  getBlockDateTime,
} from "./utilities/timeTravel";
import { DateTime } from "luxon";

import ILnCollateralSystem from "../artifacts/contracts/interfaces/ILnCollateralSystem.sol/ILnCollateralSystem.json";

const { formatBytes32String } = ethers.utils;

use(waffle.solidity);

describe("LnRewardLocker", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    rewarder: SignerWithAddress;

  let lnAccessControl: Contract,
    lnRewardLocker: Contract,
    lnCollateralSystem: Contract;

  const mockLinaAddress = "0x0000000000000000000000000000000000000001";

  beforeEach(async function () {
    [
      deployer,
      admin,
      alice,
      bob,
      charlie,
      rewarder,
    ] = await ethers.getSigners();

    const LnAccessControl = await ethers.getContractFactory("LnAccessControl");
    const LnRewardLocker = await ethers.getContractFactory("LnRewardLocker");

    lnAccessControl = await LnAccessControl.deploy();
    await lnAccessControl.connect(deployer).__LnAccessControl_init(
      admin.address // admin
    );

    lnRewardLocker = await LnRewardLocker.deploy();
    await lnRewardLocker.connect(deployer).__LnRewardLocker_init(
      mockLinaAddress, // _linaTokenAddr
      lnAccessControl.address, // _accessCtrl
      admin.address // _admin
    );

    lnCollateralSystem = await waffle.deployMockContract(
      deployer,
      ILnCollateralSystem.abi
    );
    await lnCollateralSystem.mock.collateralFromUnlockReward.returns();
  });

  it("only LOCK_REWARD role can add reward", async () => {
    await expect(
      lnRewardLocker.connect(alice).addReward(
        bob.address, // user
        10, // amount
        20 // unlockTime
      )
    ).to.be.revertedWith("LnRewardLocker: not LOCK_REWARD role");

    await lnAccessControl.connect(admin).SetRoles(
      formatBytes32String("LOCK_REWARD"), // roleType
      [alice.address], // addresses
      [true] // setTo
    );

    await expect(
      lnRewardLocker.connect(alice).addReward(
        bob.address, // user
        10, // amount
        20 // unlockTime
      )
    )
      .to.emit(lnRewardLocker, "RewardEntryAdded")
      .withArgs(
        1, //entryId
        bob.address, // user
        10, // amount
        20 // unlockTime
      );

    const rewardEntry = await lnRewardLocker.rewardEntries(1, bob.address);
    expect(rewardEntry.amount).to.equal(10);
    expect(rewardEntry.unlockTime).to.equal(20);

    expect(await lnRewardLocker.lockedAmountByAddresses(bob.address)).to.equal(
      10
    );
    expect(await lnRewardLocker.totalLockedAmount()).to.equal(10);
  });

  it("only admin can migrate rewards", async () => {
    await expect(
      lnRewardLocker.connect(alice).migrateRewards(
        [alice.address, bob.address], // users
        [10, 20], // amounts
        [30, 40] // unlockTimes
      )
    ).to.be.revertedWith(
      "LnAdminUpgradeable: only the contract admin can perform this action"
    );

    await expect(
      lnRewardLocker.connect(admin).migrateRewards(
        [alice.address, bob.address], // users
        [10, 20], // amounts
        [30, 40] // unlockTimes
      )
    )
      .to.emit(lnRewardLocker, "RewardEntryAdded")
      .withArgs(
        1, //entryId
        alice.address, // user
        10, // amount
        30 // unlockTime
      )
      .and.emit(lnRewardLocker, "RewardEntryAdded")
      .withArgs(
        2, //entryId
        bob.address, // user
        20, // amount
        40 // unlockTime
      );

    const aliceEntry = await lnRewardLocker.rewardEntries(1, alice.address);
    expect(aliceEntry.amount).to.equal(10);
    expect(aliceEntry.unlockTime).to.equal(30);

    const bobEntry = await lnRewardLocker.rewardEntries(2, bob.address);
    expect(bobEntry.amount).to.equal(20);
    expect(bobEntry.unlockTime).to.equal(40);

    expect(
      await lnRewardLocker.lockedAmountByAddresses(alice.address)
    ).to.equal(10);
    expect(await lnRewardLocker.lockedAmountByAddresses(bob.address)).to.equal(
      20
    );
    expect(await lnRewardLocker.totalLockedAmount()).to.equal(30);
  });

  it("reward amount cannot overflow", async () => {
    const uint216Max = BigNumber.from("0x" + "f".repeat(216 / 4));

    // Allow Alice to add reward
    await lnAccessControl.connect(admin).SetRoles(
      formatBytes32String("LOCK_REWARD"), // roleType
      [alice.address], // addresses
      [true] // setTo
    );

    await expect(
      lnRewardLocker.connect(alice).addReward(
        alice.address, // user
        uint216Max.add(1), // amount
        10 // unlockTime
      )
    ).to.revertedWith("LnRewardLocker: reward amount overflow");

    await lnRewardLocker.connect(alice).addReward(
      alice.address, // user
      uint216Max, // amount
      10 // unlockTime
    );
  });

  it("unlock time cannot overflow", async () => {
    const uint40Max = BigNumber.from("0x" + "f".repeat(40 / 4));

    // Allow Alice to add reward
    await lnAccessControl.connect(admin).SetRoles(
      formatBytes32String("LOCK_REWARD"), // roleType
      [alice.address], // addresses
      [true] // setTo
    );

    await expect(
      lnRewardLocker.connect(alice).addReward(
        alice.address, // user
        10, // amount
        uint40Max.add(1) // unlockTime
      )
    ).to.revertedWith("LnRewardLocker: unlock time overflow");

    await lnRewardLocker.connect(alice).addReward(
      alice.address, // user
      10, // amount
      uint40Max // unlockTime
    );
  });

  it("only UNLOCK_REWARD role can unlock reward", async () => {
    let unlockTime: DateTime = (await getBlockDateTime(ethers.provider)).plus({
      hour: 1,
    });

    await lnAccessControl.connect(admin).SetRoles(
      formatBytes32String("LOCK_REWARD"), // roleType
      [alice.address], // addresses
      [true] // setTo
    );

    await lnRewardLocker.connect(alice).addReward(
      bob.address, // user
      10, // amount
      unlockTime.toSeconds() // unlockTime
    );

    expect(await lnRewardLocker.lockedAmountByAddresses(bob.address)).to.equal(
      10
    );

    setNextBlockTimestamp(ethers.provider, unlockTime);
    await lnRewardLocker
      .connect(admin)
      .updateCollateralSystemAddress(lnCollateralSystem.address);
    await lnRewardLocker.connect(admin).updateRewarderAddress(rewarder.address);

    await expect(
      lnRewardLocker.connect(alice).unlockReward(
        bob.address, // user
        1 // rewardEntryId
      )
    ).to.revertedWith("LnRewardLocker: not UNLOCK_REWARD role");

    await lnAccessControl.connect(admin).SetRoles(
      formatBytes32String("UNLOCK_REWARD"), // roleType
      [charlie.address], // addresses
      [true] // setTo
    );

    await expect(
      lnRewardLocker.connect(charlie).unlockReward(
        bob.address, // user
        1 // rewardEntryId
      )
    )
      .to.emit(lnRewardLocker, "RewardEntryUnlocked")
      .withArgs(
        1, //entryId
        bob.address, // user
        10 // amount
      );

    const rewardEntry = await lnRewardLocker.rewardEntries(1, bob.address);
    expect(rewardEntry.amount).to.equal(0);
    expect(rewardEntry.unlockTime).to.equal(0);

    expect(await lnRewardLocker.lockedAmountByAddresses(bob.address)).to.equal(
      0
    );
    expect(await lnRewardLocker.totalLockedAmount()).to.equal(0);
  });

  it("only admin can set collateral system address", async () => {
    await expect(
      lnRewardLocker
        .connect(alice)
        .updateCollateralSystemAddress(lnCollateralSystem.address)
    ).to.be.revertedWith(
      "LnAdminUpgradeable: only the contract admin can perform this action"
    );
  });

  it("only admin can set rewarder address", async () => {
    await expect(
      lnRewardLocker.connect(alice).updateRewarderAddress(rewarder.address)
    ).to.be.revertedWith(
      "LnAdminUpgradeable: only the contract admin can perform this action"
    );
  });

  it("cannot unlock reward if collateral system and rewarder address is not set", async () => {
    await lnAccessControl.connect(admin).SetRoles(
      formatBytes32String("UNLOCK_REWARD"), // roleType
      [charlie.address], // addresses
      [true] // setTo
    );

    await expect(
      lnRewardLocker.connect(charlie).unlockReward(
        bob.address, // user
        1 // rewardEntryId
      )
    ).to.be.revertedWith("Rewarder address not set");

    lnRewardLocker.connect(admin).updateRewarderAddress(rewarder.address);
    await expect(
      lnRewardLocker.connect(charlie).unlockReward(
        bob.address, // user
        1 // rewardEntryId
      )
    ).to.be.revertedWith("Collateral system address not set");
  });

  it("cannot unlock reward if user doesn't have reward locked", async () => {
    lnRewardLocker
      .connect(admin)
      .updateCollateralSystemAddress(lnCollateralSystem.address);
    lnRewardLocker.connect(admin).updateRewarderAddress(rewarder.address);
    await lnAccessControl.connect(admin).SetRoles(
      formatBytes32String("UNLOCK_REWARD"), // roleType
      [charlie.address], // addresses
      [true] // setTo
    );

    await expect(
      lnRewardLocker.connect(charlie).unlockReward(
        bob.address, // user
        1 // rewardEntryId
      )
    ).to.be.revertedWith("Reward entry amount is 0, no reward to unlock");
  });

  it("cannot unlock reward if unlock time is not reached", async () => {
    let unlockTime: DateTime = (await getBlockDateTime(ethers.provider)).plus({
      hour: 1,
    });

    await lnAccessControl.connect(admin).SetRoles(
      formatBytes32String("LOCK_REWARD"), // roleType
      [alice.address], // addresses
      [true] // setTo
    );

    await lnRewardLocker.connect(alice).addReward(
      bob.address, // user
      10, // amount
      unlockTime.toSeconds() // unlockTime
    );

    expect(await lnRewardLocker.lockedAmountByAddresses(bob.address)).to.equal(
      10
    );

    lnRewardLocker
      .connect(admin)
      .updateCollateralSystemAddress(lnCollateralSystem.address);
    lnRewardLocker.connect(admin).updateRewarderAddress(rewarder.address);
    await lnAccessControl.connect(admin).SetRoles(
      formatBytes32String("UNLOCK_REWARD"), // roleType
      [charlie.address], // addresses
      [true] // setTo
    );

    setNextBlockTimestamp(
      ethers.provider,
      unlockTime.minus({ seconds: 1 }).toSeconds()
    );
    await expect(
      lnRewardLocker.connect(charlie).unlockReward(
        bob.address, // user
        1 // rewardEntryId
      )
    ).to.be.revertedWith("Unlock time not reached");

    setNextBlockTimestamp(
      ethers.provider,
      unlockTime.plus({ seconds: 1 }).toSeconds()
    );

    await expect(
      lnRewardLocker.connect(charlie).unlockReward(
        bob.address, // user
        1 // rewardEntryId
      )
    )
      .to.emit(lnRewardLocker, "RewardEntryUnlocked")
      .withArgs(
        1, //entryId
        bob.address, // user
        10 // amount
      );

    const rewardEntry = await lnRewardLocker.rewardEntries(1, bob.address);
    expect(rewardEntry.amount).to.equal(0);
    expect(rewardEntry.unlockTime).to.equal(0);

    expect(await lnRewardLocker.lockedAmountByAddresses(bob.address)).to.equal(
      0
    );
    expect(await lnRewardLocker.totalLockedAmount()).to.equal(0);
  });
});
