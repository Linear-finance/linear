import { ethers, waffle } from "hardhat";
import { expect, use } from "chai";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

const { formatBytes32String } = ethers.utils;

use(waffle.solidity);

describe("LnRewardLocker", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress;

  let lnAccessControl: Contract, lnRewardLocker: Contract;

  const mockLinaAddress = "0x0000000000000000000000000000000000000001";

  beforeEach(async function () {
    [deployer, admin, alice, bob] = await ethers.getSigners();

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
});
