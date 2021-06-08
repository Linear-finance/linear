import { ethers } from "hardhat";
import { expect } from "chai";
import { BigNumber, Wallet } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expandTo18Decimals, uint256Max } from "../utilities";
import { deployLinearStack, DeployedStack } from "../utilities/init";
import { setNextBlockTimestamp } from "../utilities/timeTravel";
import { DateTime, Duration } from "luxon";

describe("Integration | Unlock Reward", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    rewardUnlocker: SignerWithAddress,
    rewarder: SignerWithAddress,
    rewardSigner: Wallet;

  let stack: DeployedStack;

  let aliceSignaturePeriod1: string;
  const periodDuration: Duration = Duration.fromObject({ weeks: 1 });
  const stakingRewardLockTime: Duration = Duration.fromObject({ weeks: 52 });

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
      verifyingContract: stack.lnRewardSystem.address,
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
    [deployer, alice, rewardUnlocker, rewarder] = await ethers.getSigners();
    admin = deployer;
    rewardSigner = Wallet.createRandom();

    stack = await deployLinearStack(deployer, admin);

    // Mint 1,000,000 LINA to Alice
    await stack.linaToken
      .connect(admin)
      .mint(alice.address, expandTo18Decimals(1_000_000));

    await stack.linaToken
      .connect(alice)
      .approve(stack.lnCollateralSystem.address, uint256Max);

    await stack.linaToken
      .connect(alice)
      .transfer(rewarder.address, expandTo18Decimals(10_000));

    // Set rewarder address to `LnRewardLocker`
    await stack.lnRewardLocker
      .connect(admin)
      .updateRewarderAddress(rewarder.address);

    // Update LnRewardSystem reward signer to rewardSigner
    await stack.lnRewardSystem
      .connect(admin)
      .setRewardSigner(rewardSigner.address);

    // Create a signature of Period 1, 100 staking reward, 0 fee reward
    aliceSignaturePeriod1 = await createSignature(
      rewardSigner,
      BigNumber.from(1),
      alice.address,
      expandTo18Decimals(100),
      BigNumber.from(0)
    );
  });

  it("end to end test from claim reward to unlock reward", async () => {
    // Alice stakes 9,000 LINA
    await stack.lnCollateralSystem.connect(alice).Collateral(
      ethers.utils.formatBytes32String("LINA"), // _currency
      expandTo18Decimals(9_000) // _amount
    );

    // Returns 9,000 when locked amount is zero
    expect(
      await stack.lnCollateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(9_000));

    // Fast forward to 1st period end
    const rewardSystemFirstPeriod = await stack.lnRewardSystem.firstPeriodStartTime();
    await setNextBlockTimestamp(
      ethers.provider,
      DateTime.fromSeconds(parseInt(rewardSystemFirstPeriod.toString())).plus(
        periodDuration
      )
    );

    // Alice claim reward
    await expect(
      stack.lnRewardSystem.connect(alice).claimReward(
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        BigNumber.from(0), // feeReward
        aliceSignaturePeriod1 // signature
      )
    )
      .to.emit(stack.lnRewardSystem, "RewardClaimed")
      .withArgs(
        alice.address, // recipient
        1, // periodId
        expandTo18Decimals(100), // stakingReward
        BigNumber.from(0) // feeReward
      );

    expect(
      await stack.lnRewardLocker.lockedAmountByAddresses(alice.address)
    ).to.equal(expandTo18Decimals(100));

    // Fast forward to unlock time
    await setNextBlockTimestamp(
      ethers.provider,
      DateTime.fromSeconds(parseInt(rewardSystemFirstPeriod.toString()))
        .plus(periodDuration)
        .plus(stakingRewardLockTime)
    );

    // Approve lnCollateralSystem to spend LINA from rewarder
    await stack.linaToken
      .connect(rewarder)
      .approve(stack.lnCollateralSystem.address, expandTo18Decimals(100));

    await expect(
      stack.lnRewardLocker.connect(rewardUnlocker).unlockReward(
        alice.address, // user
        1 // rewardEntryId
      )
    )
      .to.emit(stack.lnRewardLocker, "RewardEntryUnlocked")
      .withArgs(
        1, //entryId
        alice.address, // user
        expandTo18Decimals(100) // amount
      )
      .to.emit(stack.lnCollateralSystem, "CollateralUnlockReward")
      .withArgs(
        alice.address,
        ethers.utils.formatBytes32String("LINA"),
        expandTo18Decimals(100),
        expandTo18Decimals(9_100)
      )
      .to.emit(stack.linaToken, "Transfer")
      .withArgs(
        rewarder.address,
        stack.lnCollateralSystem.address,
        expandTo18Decimals(100)
      );

    // Returns 9,000 when locked amount is zero
    expect(
      await stack.lnCollateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(9_100));

    await expect(
      stack.lnCollateralSystem
        .connect(alice)
        .RedeemMax(ethers.utils.formatBytes32String("LINA"))
    )
      .to.emit(stack.lnCollateralSystem, "RedeemCollateral")
      .withArgs(
        alice.address,
        ethers.utils.formatBytes32String("LINA"),
        expandTo18Decimals(9_100),
        BigNumber.from("0")
      )
      .to.emit(stack.linaToken, "Transfer")
      .withArgs(
        stack.lnCollateralSystem.address,
        alice.address,
        expandTo18Decimals(9_100)
      );

    expect(await stack.linaToken.balanceOf(alice.address)).to.eq(
      expandTo18Decimals(990_100)
    );
  });
});
