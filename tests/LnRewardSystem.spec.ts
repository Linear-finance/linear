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
    rewardSigner1: Wallet,
    rewardSigner2: Wallet;

  let lusd: Contract,
    lnCollateralSystem: MockContract,
    lnRewardLocker: Contract,
    lnRewardSystem: Contract;

  let aliceSignaturePeriod1: string[];

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

  const createSignatures = async (
    signers: Wallet[],
    periodId: BigNumber,
    recipient: string,
    stakingReward: BigNumber,
    feeReward: BigNumber
  ): Promise<string[]> => {
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

    return await Promise.all(
      signers.map((signer) => signer._signTypedData(domain, types, value))
    );
  };

  beforeEach(async function () {
    [deployer, admin, alice, bob] = await ethers.getSigners();
    rewardSigner1 = Wallet.createRandom();
    rewardSigner2 = Wallet.createRandom();
    if (
      BigNumber.from(rewardSigner1.address).gt(
        BigNumber.from(rewardSigner2.address)
      )
    ) {
      const temp = rewardSigner1;
      rewardSigner1 = rewardSigner2;
      rewardSigner2 = temp;
    }

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
      "lUSD", // _symbol
      18 // _decimals
    );

    lnCollateralSystem = await waffle.deployMockContract(
      deployer,
      ILnCollateralSystem.abi
    );
    await lnCollateralSystem.mock.IsSatisfyTargetRatio.returns(true);

    lnRewardLocker = await MockLnRewardLocker.deploy();

    lnRewardSystem = await LnRewardSystem.deploy();
    await lnRewardSystem.connect(deployer).__LnRewardSystem_init(
      firstPeriodStartTime.toSeconds(), // _firstPeriodStartTime
      [rewardSigner1.address, rewardSigner2.address], // _rewardSigners
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
    aliceSignaturePeriod1 = await createSignatures(
      [rewardSigner1, rewardSigner2],
      BigNumber.from(1),
      alice.address,
      expandTo18Decimals(100),
      expandTo18Decimals(200)
    );
  });

  it("only admin can change signer", async () => {
    expect(await lnRewardSystem.rewardSigners(0)).to.equal(
      rewardSigner1.address
    );
    expect(await lnRewardSystem.rewardSigners(1)).to.equal(
      rewardSigner2.address
    );

    await expect(
      lnRewardSystem.connect(alice).setRewardSigners([alice.address])
    ).to.revertedWith(
      "LnAdminUpgradeable: only the contract admin can perform this action"
    );

    await lnRewardSystem
      .connect(admin)
      .setRewardSigners([
        "0x0000000000000000000000000000000000000001",
        "0x0000000000000000000000000000000000000002",
      ]);

    expect(await lnRewardSystem.rewardSigners(0)).to.equal(
      "0x0000000000000000000000000000000000000001"
    );
    expect(await lnRewardSystem.rewardSigners(1)).to.equal(
      "0x0000000000000000000000000000000000000002"
    );
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
    const fakeSigner1 = Wallet.createRandom();
    const fakeSigner2 = Wallet.createRandom();
    const fakeSignature = await createSignatures(
      [fakeSigner1, fakeSigner2],
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
    await lnCollateralSystem.mock.IsSatisfyTargetRatio.returns(false);

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
