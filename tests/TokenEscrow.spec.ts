import { ethers, waffle } from "hardhat";
import { expect, use } from "chai";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { DateTime, Duration } from "luxon";
import {
  expandTo18Decimals,
  uint32Max,
  uint128Max,
  uint256Max,
} from "./utilities";
import {
  getBlockDateTime,
  mineBlock,
  setNextBlockTimestamp,
} from "./utilities/timeTravel";

use(waffle.solidity);

describe("TokenEscrow", function () {
  let deployer: SignerWithAddress,
    owner: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    david: SignerWithAddress;

  let erc20Token: Contract, tokenEscrow: Contract;

  let deploymentTime: DateTime;

  beforeEach(async function () {
    [deployer, owner, alice, bob, charlie, david] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const TokenEscrow = await ethers.getContractFactory("TokenEscrow");

    erc20Token = await MockERC20.deploy(
      "Mock Token", // _name
      "MOCK", // _symbol
      8 // _decimals
    );
    await erc20Token.connect(deployer).mint(
      owner.address, // account
      expandTo18Decimals(10_000_000_000), // amount
    );

    tokenEscrow = await TokenEscrow.deploy();
    await tokenEscrow.connect(deployer).__TokenEscrow_init(
      erc20Token.address, // _token
    );

    await tokenEscrow.connect(deployer).transferOwnership(
      owner.address, // newOwner
    );

    deploymentTime = await getBlockDateTime(ethers.provider);

    // Distribute 1B token to escrow
    await erc20Token.connect(owner).transfer(
      tokenEscrow.address, // recipient
      expandTo18Decimals(1_000_000_000), // amount
    );
  });

  it("only owner can set vesting schedule", async () => {
    await expect(
      tokenEscrow.connect(alice).setVestingSchedule(
        bob.address, // user
        1, // amount
        2, // startTime
        10, // endTime
        2, // step
      ),
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await tokenEscrow.connect(owner).setVestingSchedule(
      bob.address, // user
      1, // amount
      2, // startTime
      10, // endTime
      2, // step
    );
  });

  it("only owner can set cliff", async () => {
    await expect(
      tokenEscrow.connect(alice).setCliff(
        bob.address, // user
        1, // amount
        1, // unlockTime
      ),
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await tokenEscrow.connect(owner).setCliff(
      bob.address, // user
      1, // amount
      1, // unlockTime
    );
  });

  it("only owner can remove vesting schedule", async () => {
    await tokenEscrow.connect(owner).setVestingSchedule(
      bob.address, // user
      1, // amount
      2, // startTime
      10, // endTime
      2, // step
    );
    expect(
      (await tokenEscrow.vestingSchedules(bob.address)).amount,
    ).to.not.equal(0);

    await expect(
      tokenEscrow.connect(alice).removeVestingSchedule(
        bob.address, // user
      ),
    ).to.be.revertedWith("Ownable: caller is not the owner");

    await tokenEscrow.connect(owner).removeVestingSchedule(
      bob.address, // user
    );
    expect((await tokenEscrow.vestingSchedules(bob.address)).amount).to.equal(
      0,
    );
  });

  it("vesting schedule params must not overflow", async () => {
    await expect(
      tokenEscrow.connect(owner).setVestingSchedule(
        bob.address, // user
        uint128Max.add(1), // amount
        2, // startTime
        10, // endTime
        1, // step
      ),
    ).to.be.revertedWith("TokenEscrow: amount overflow");

    await expect(
      tokenEscrow.connect(owner).setVestingSchedule(
        bob.address, // user
        1, // amount
        uint32Max.add(1), // startTime
        uint32Max.add(2), // endTime
        1, // step
      ),
    ).to.be.revertedWith("TokenEscrow: startTime overflow");

    await expect(
      tokenEscrow.connect(owner).setVestingSchedule(
        bob.address, // user
        1, // amount
        2, // startTime
        uint32Max.add(1), // endTime
        1, // step
      ),
    ).to.be.revertedWith("TokenEscrow: endTime overflow");
  });

  it("cliff params must not overflow", async () => {
    await expect(
      tokenEscrow.connect(owner).setCliff(
        bob.address, // user
        uint128Max.add(1), // amount
        1, // unlockTime
      ),
    ).to.be.revertedWith("TokenEscrow: amount overflow");

    await expect(
      tokenEscrow.connect(owner).setCliff(
        bob.address, // user
        1, // amount
        uint32Max.add(1), // unlockTime
      ),
    ).to.be.revertedWith("TokenEscrow: unlockTime overflow");
  });

  it("cannot set vesting schedule for the same address twice", async () => {
    await expect(
      tokenEscrow.connect(owner).setVestingSchedule(
        bob.address, // user
        100, // amount
        200, // startTime
        300, // endTime
        50, // step
      ),
    )
      .to.emit(tokenEscrow, "VestingScheduleAdded")
      .withArgs(
        bob.address, // user
        100, // amount
        200, // startTime
        300, // endTime
        50, // step
      );

    await expect(
      tokenEscrow.connect(owner).setVestingSchedule(
        bob.address, // user
        100, // amount
        200, // startTime
        300, // endTime
        50, // step
      ),
    ).to.be.revertedWith("TokenEscrow: vesting schedule already exists");
  });

  it("cannot set cliff for the same address twice", async () => {
    await expect(
      tokenEscrow.connect(owner).setCliff(
        bob.address, // user
        100, // amount
        200, // unlockTime
      ),
    )
      .to.emit(tokenEscrow, "CliffAdded")
      .withArgs(
        bob.address, // user
        100, // amount
        200, // unlockTime
      );

    await expect(
      tokenEscrow.connect(owner).setCliff(
        bob.address, // user
        100, // amount
        200, // unlockTime
      ),
    ).to.be.revertedWith("TokenEscrow: cliff already exists");
  });

  it("vesting amounts can only be redeemed by steps", async () => {
    const startTime = deploymentTime.plus({ days: 5 });
    const step: Duration = Duration.fromObject({ seconds: 100 });

    await tokenEscrow.connect(owner).setVestingSchedule(
      alice.address, // user
      10000, // amount
      startTime.toSeconds(), // startTime
      startTime.toSeconds() + step.as("seconds") * 10, // endTime
      step.as("seconds"), // step
    );

    // Cannot claim before reaching start time
    await expect(tokenEscrow.connect(alice).withdraw()).to.be.revertedWith(
      "TokenEscrow: nothing to withdraw",
    );

    // Cannot claim before reaching the first step
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(step).minus({ seconds: 1 }),
    );
    await expect(tokenEscrow.connect(alice).withdraw()).to.be.revertedWith(
      "TokenEscrow: nothing to withdraw",
    );

    await setNextBlockTimestamp(ethers.provider, startTime.plus(step));
    await expect(tokenEscrow.connect(alice).withdraw())
      .to.emit(tokenEscrow, "TokenVested")
      .withArgs(alice.address, 1000)
      .and.emit(erc20Token, "Transfer")
      .withArgs(
        tokenEscrow.address, // sender
        alice.address, // recipient
        1000, // amount
      );

    // Cannot claim again until next step
    await expect(tokenEscrow.connect(alice).withdraw()).to.be.revertedWith(
      "TokenEscrow: nothing to withdraw",
    );
  });

  it("can claim multiple vesting steps at once", async () => {
    const startTime = deploymentTime.plus({ days: 5 });
    const step: Duration = Duration.fromObject({ seconds: 100 });

    await tokenEscrow.connect(owner).setVestingSchedule(
      alice.address, // user
      10000, // amount
      startTime.toSeconds(), // startTime
      startTime.toSeconds() + step.as("seconds") * 10, // endTime
      step.as("seconds"), // step
    );

    // Claim 3 steps at once
    await setNextBlockTimestamp(
      ethers.provider,
      startTime.plus(step).plus(step).plus(step),
    );
    await expect(tokenEscrow.connect(alice).withdraw())
      .to.emit(tokenEscrow, "TokenVested")
      .withArgs(alice.address, 3000)
      .and.emit(erc20Token, "Transfer")
      .withArgs(
        tokenEscrow.address, // sender
        alice.address, // recipient
        3000, // amount
      );

    // Claim 3 steps at once
    await setNextBlockTimestamp(
      ethers.provider,
      DateTime.fromSeconds(startTime.toSeconds() + step.as("seconds") * 5.5),
    );
    await expect(tokenEscrow.connect(alice).withdraw())
      .to.emit(tokenEscrow, "TokenVested")
      .withArgs(alice.address, 2000)
      .and.emit(erc20Token, "Transfer")
      .withArgs(
        tokenEscrow.address, // sender
        alice.address, // recipient
        2000, // amount
      );

    // Claim all remaining steps
    await setNextBlockTimestamp(ethers.provider, startTime.plus({ years: 10 }));
    await expect(tokenEscrow.connect(alice).withdraw())
      .to.emit(tokenEscrow, "TokenVested")
      .withArgs(alice.address, 5000)
      .and.emit(erc20Token, "Transfer")
      .withArgs(
        tokenEscrow.address, // sender
        alice.address, // recipient
        5000, // amount
      );

    // Nothing to withdraw anymore
    await expect(tokenEscrow.connect(alice).withdraw()).to.be.revertedWith(
      "TokenEscrow: nothing to withdraw",
    );
  });

  it("cannot claim cliff until unlock time", async () => {
    const unlockTime = deploymentTime.plus({ days: 5 });

    await tokenEscrow.connect(owner).setCliff(
      alice.address, // user
      10000, // amount
      unlockTime.toSeconds(), // unlockTime
    );

    // Cannot claim before reaching the first step
    await setNextBlockTimestamp(
      ethers.provider,
      unlockTime.minus({ seconds: 1 }),
    );
    await expect(tokenEscrow.connect(alice).withdraw()).to.be.revertedWith(
      "TokenEscrow: nothing to withdraw",
    );

    await setNextBlockTimestamp(ethers.provider, unlockTime);
    await expect(tokenEscrow.connect(alice).withdraw())
      .to.emit(tokenEscrow, "CliffWithdrawn")
      .withArgs(alice.address, 10000)
      .and.emit(erc20Token, "Transfer")
      .withArgs(
        tokenEscrow.address, // sender
        alice.address, // recipient
        10000, // amount
      );

    // Nothing to withdraw anymore
    await expect(tokenEscrow.connect(alice).withdraw()).to.be.revertedWith(
      "TokenEscrow: nothing to withdraw",
    );
  });

  it("can claim from both vesting and cliff at once", async () => {
    const startTime = deploymentTime.plus({ days: 5 });
    const step: Duration = Duration.fromObject({ seconds: 100 });
    const unlockTime = startTime.plus(step).plus(step);

    await tokenEscrow.connect(owner).setVestingSchedule(
      alice.address, // user
      10000, // amount
      startTime.toSeconds(), // startTime
      startTime.toSeconds() + step.as("seconds") * 10, // endTime
      step.as("seconds"), // step
    );
    await tokenEscrow.connect(owner).setCliff(
      alice.address, // user
      10000, // amount
      unlockTime.toSeconds(), // unlockTime
    );

    await setNextBlockTimestamp(ethers.provider, unlockTime);
    await expect(tokenEscrow.connect(alice).withdraw())
      .to.emit(tokenEscrow, "TokenVested")
      .withArgs(alice.address, 2000)
      .to.emit(tokenEscrow, "CliffWithdrawn")
      .withArgs(alice.address, 10000)
      .and.emit(erc20Token, "Transfer")
      .withArgs(
        tokenEscrow.address, // sender
        alice.address, // recipient
        12000, // amount
      );
  });
});
