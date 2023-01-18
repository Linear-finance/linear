import { ethers, waffle } from "hardhat";
import { expect, use } from "chai";
import { BigNumber, Contract, Wallet } from "ethers";
import { MockContract } from "ethereum-waffle";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { DateTime, Duration } from "luxon";
import { expandTo18Decimals } from "./utilities";
import {
  getBlockDateTime,
  setNextBlockTimestamp,
} from "./utilities/timeTravel";

import ILnCollateralSystem from "../artifacts/contracts/interfaces/ILnCollateralSystem.sol/ILnCollateralSystem.json";

use(waffle.solidity);

describe("LnRewardSystem", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    rewardSigner: Wallet;

  let lusd: Contract,
    lnCollateralSystem: MockContract,
    lnRewardLocker: Contract,
    lnRewardSystem: Contract;

  let aliceSignaturePeriod1: string;

  let firstPeriodStartTime: DateTime;
  const periodDuration: Duration = Duration.fromObject({ weeks: 1 });
  const stakingRewardLockTime: Duration = Duration.fromObject({ weeks: 52 });

  const getPeriodEndTime = (periodId: number): DateTime => {
    let endTime = firstPeriodStartTime;
    for (let ind = 0; ind < periodId; ind++) {
      endTime = endTime.plus(periodDuration);
    }
    return endTime;
  };

  const createSignature = async (
    signer: Wallet,
    periodId: BigNumber,
    recipient: string,
    stakingReward: BigNumber,
    feeReward: BigNumber
  ): Promise<string> => {
    const domain = {
      name: "Linear",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: lnRewardSystem.address,
    };

    const types = {
      Reward: [
        { name: "periodId", type: "uint256" },
        { name: "recipient", type: "address" },
        { name: "stakingReward", type: "uint256" },
        { name: "feeReward", type: "uint256" },
      ],
    };

    const value = {
      periodId,
      recipient,
      stakingReward,
      feeReward,
    };

    const signatureHex = await signer._signTypedData(domain, types, value);

    return signatureHex;
  };

  beforeEach(async function () {
    [deployer, admin, alice, bob] = await ethers.getSigners();
    rewardSigner = Wallet.createRandom();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const MockLnRewardLocker = await ethers.getContractFactory(
      "MockLnRewardLocker"
    );
    const LnRewardSystem = await ethers.getContractFactory("LnRewardSystem");

    firstPeriodStartTime = (await getBlockDateTime(ethers.provider)).plus({
      days: 1,
    });

    lusd = await MockERC20.deploy(
      "lUSD", // _name
      "lUSD" // _symbol
    );

    lnCollateralSystem = await waffle.deployMockContract(
      deployer,
      ILnCollateralSystem.abi
    );
    await lnCollateralSystem.mock.IsSatisfyTargetRatioByCurrency.returns(true);

    lnRewardLocker = await MockLnRewardLocker.deploy();

    lnRewardSystem = await LnRewardSystem.deploy();
    await lnRewardSystem.connect(deployer).__LnRewardSystem_init(
      firstPeriodStartTime.toSeconds(), // _firstPeriodStartTime
      rewardSigner.address, // _rewardSigner
      lusd.address, // _lusdAddress
      lnCollateralSystem.address, // _collateralSystemAddress
      lnRewardLocker.address, // _rewardLockerAddress
      admin.address // _admin
    );

    // LnRewardSystem holds 1,000,000 lUSD to start
    await lusd
      .connect(deployer)
      .mint(lnRewardSystem.address, expandTo18Decimals(1_000_000));

    // Period 1, 100 staking reward, 100 fee reward
    aliceSignaturePeriod1 = await createSignature(
      rewardSigner,
      BigNumber.from(1),
      alice.address,
      expandTo18Decimals(100),
      expandTo18Decimals(200)
    );
  });

  it("only admin can change signer", async () => {
    expect(await lnRewardSystem.rewardSigner()).to.equal(rewardSigner.address);

    await expect(
      lnRewardSystem.connect(alice).setRewardSigner(alice.address)
    ).to.revertedWith(
      "LnAdminUpgradeable: only the contract admin can perform this action"
    );

    await lnRewardSystem.connect(admin).setRewardSigner(alice.address);

    expect(await lnRewardSystem.rewardSigner()).to.equal(alice.address);
  });

  it("can claim reward with valid signature", async () => {
    await setNextBlockTimestamp(ethers.provider, getPeriodEndTime(1));

    await expect(
      lnRewardSystem.connect(alice).claimReward(
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        expandTo18Decimals(200), // feeReward
        aliceSignaturePeriod1 // signature
      )
    )
      .to.emit(lnRewardSystem, "RewardClaimed")
      .withArgs(
        alice.address, // recipient
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        expandTo18Decimals(200) // feeReward
      )
      .to.emit(lusd, "Transfer")
      .withArgs(lnRewardSystem.address, alice.address, expandTo18Decimals(200));

    // Assert staking reward
    const lastAppendRewardCall = await lnRewardLocker.lastAppendRewardCall();
    expect(lastAppendRewardCall._user).to.equal(alice.address);
    expect(lastAppendRewardCall._amount).to.equal(expandTo18Decimals(100));
    expect(lastAppendRewardCall._lockTo).to.equal(
      getPeriodEndTime(1).plus(stakingRewardLockTime).toSeconds()
    );

    // Assert fee reward
    expect(await lusd.balanceOf(lnRewardSystem.address)).to.equal(
      expandTo18Decimals(999_800)
    );
    expect(await lusd.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(200)
    );
  });

  it("cannot claim reward with invalid signature", async () => {
    // Signature for the same struct generated by a random signer
    const fakeSigner = Wallet.createRandom();
    const fakeSignature = await createSignature(
      fakeSigner,
      BigNumber.from(1),
      alice.address,
      expandTo18Decimals(100),
      expandTo18Decimals(200)
    );

    await setNextBlockTimestamp(ethers.provider, getPeriodEndTime(2));

    // Wrong period id
    await expect(
      lnRewardSystem.connect(alice).claimReward(
        2, // periodId
        expandTo18Decimals(100), // stakingReward
        expandTo18Decimals(200), // feeReward
        aliceSignaturePeriod1 // signature
      )
    ).to.revertedWith("LnRewardSystem: invalid signature");

    // Wrong staking reward
    await expect(
      lnRewardSystem.connect(alice).claimReward(
        1, // periodId
        expandTo18Decimals(200), // stakingReward
        expandTo18Decimals(200), // feeReward
        aliceSignaturePeriod1 // signature
      )
    ).to.revertedWith("LnRewardSystem: invalid signature");

    // Wrong fee reward
    await expect(
      lnRewardSystem.connect(alice).claimReward(
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        expandTo18Decimals(300), // feeReward
        aliceSignaturePeriod1 // signature
      )
    ).to.revertedWith("LnRewardSystem: invalid signature");

    // Wrong signer
    await expect(
      lnRewardSystem.connect(alice).claimReward(
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        expandTo18Decimals(200), // feeReward
        fakeSignature // signature
      )
    ).to.revertedWith("LnRewardSystem: invalid signature");
  });

  it("cannot claim reward before period ends", async () => {
    await setNextBlockTimestamp(
      ethers.provider,
      getPeriodEndTime(1).minus({ seconds: 1 })
    );

    await expect(
      lnRewardSystem.connect(alice).claimReward(
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        expandTo18Decimals(200), // feeReward
        aliceSignaturePeriod1 // signature
      )
    ).to.revertedWith("LnRewardSystem: period not ended");
  });

  it("cannot claim reward after expiration", async () => {
    await setNextBlockTimestamp(ethers.provider, getPeriodEndTime(3));

    await expect(
      lnRewardSystem.connect(alice).claimReward(
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        expandTo18Decimals(200), // feeReward
        aliceSignaturePeriod1 // signature
      )
    ).to.revertedWith("LnRewardSystem: reward expired");
  });

  it("cannot claim reward if target ratio is not met", async () => {
    await setNextBlockTimestamp(ethers.provider, getPeriodEndTime(1));

    // This is a unit test so we just set it to false directly
    await lnCollateralSystem.mock.IsSatisfyTargetRatioByCurrency.returns(false);

    await expect(
      lnRewardSystem.connect(alice).claimReward(
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        expandTo18Decimals(200), // feeReward
        aliceSignaturePeriod1 // signature
      )
    ).to.revertedWith("LnRewardSystem: below target ratio");
  });

  it("cannot claim reward multiple times", async () => {
    await setNextBlockTimestamp(ethers.provider, getPeriodEndTime(1));

    await lnRewardSystem.connect(alice).claimReward(
      1, // periodId
      expandTo18Decimals(100), // stakingReward
      expandTo18Decimals(200), // feeReward
      aliceSignaturePeriod1 // signature
    );

    await expect(
      lnRewardSystem.connect(alice).claimReward(
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        expandTo18Decimals(200), // feeReward
        aliceSignaturePeriod1 // signature
      )
    ).to.revertedWith("LnRewardSystem: reward already claimed");
  });
});
