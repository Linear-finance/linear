import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expandTo18Decimals, uint256Max } from "../utilities";
import { deployLinearStack, DeployedStack } from "../utilities/init";
import { getBlockDateTime } from "../utilities/timeTravel";

describe("Integration | Build", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress;

  let stack: DeployedStack;

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);

    // Set LINA price to $0.01
    await stack.lnPrices.connect(admin).setPrice(
      ethers.utils.formatBytes32String("LINA"), // currencyKey
      expandTo18Decimals(0.01), // price
    );

    // Mint 1,000,000 LINA to Alice
    await stack.collaterals.lina.token
      .connect(admin)
      .mint(alice.address, expandTo18Decimals(1_000_000));

    await stack.collaterals.lina.token
      .connect(alice)
      .approve(stack.collaterals.lina.collateralSystem.address, uint256Max);
  });

  it("can build lUSD with just locked reward", async function () {
    // Lock 10,000 LINA of rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [expandTo18Decimals(10_000)], // _amounts
      [
        (await getBlockDateTime(ethers.provider))
          .plus({ years: 1 })
          .toSeconds(),
      ], // _lockTo
    );

    // Alice can build 1 lUSD without staking
    await stack.collaterals.lina.buildBurnSystem.connect(alice).BuildAsset(
      expandTo18Decimals(1) // amount
    );

    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(1),
    );
  });

  it("maxRedeemableLina() should return staked amount when debt is zero regardless of locked collateral", async function () {
    // Alice stakes 9,000 LINA
    await stack.collaterals.lina.collateralSystem.connect(alice).Collateral(
      ethers.utils.formatBytes32String("LINA"), // _currency
      expandTo18Decimals(9_000), // _amount
    );

    // Returns 9,000 when locked amount is zero
    expect(
      await stack.collaterals.lina.collateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(9_000));

    // Lock rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [expandTo18Decimals(9_000).sub(1)], // _amounts
      [
        (await getBlockDateTime(ethers.provider))
          .plus({ years: 1 })
          .toSeconds(),
      ], // _lockTo
    );

    // Returns 9,000 when locked amount is less than staked
    expect(
      await stack.collaterals.lina.collateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(9_000));

    // Lock 1 unit of LINA rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [1], // _amounts
      [
        (await getBlockDateTime(ethers.provider))
          .plus({ years: 1 })
          .toSeconds(),
      ], // _lockTo
    );

    // Returns 9,000 when locked amount is the same as staked
    expect(
      await stack.collaterals.lina.collateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(9_000));

    // Lock 1 unit of LINA rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [1], // _amounts
      [
        (await getBlockDateTime(ethers.provider))
          .plus({ years: 1 })
          .toSeconds(),
      ], // _lockTo
    );

    // Returns 9,000 when locked amount is the same as staked
    expect(
      await stack.collaterals.lina.collateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(9_000));
  });

  it("maxRedeemableLina() should reflect debt amount", async function () {
    // Alice stakes 9,000 LINA
    await stack.collaterals.lina.collateralSystem.connect(alice).Collateral(
      ethers.utils.formatBytes32String("LINA"), // _currency
      expandTo18Decimals(9_000), // _amount
    );

    // Alice builds 10 lUSD
    await stack.collaterals.lina.buildBurnSystem.connect(alice).BuildAsset(
      expandTo18Decimals(10) // amount
    );

    // 5,000 LINA is set aside
    expect(
      await stack.collaterals.lina.collateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(4_000));

    // Lock 4,000 LINA rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [expandTo18Decimals(4_000)], // _amounts
      [
        (await getBlockDateTime(ethers.provider))
          .plus({ years: 1 })
          .toSeconds(),
      ], // _lockTo
    );

    // Now 8,000 LINA is withdrawable
    expect(
      await stack.collaterals.lina.collateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(8_000));

    // Lock 1,000 LINA rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [expandTo18Decimals(1_000)], // _amounts
      [
        (await getBlockDateTime(ethers.provider))
          .plus({ years: 1 })
          .toSeconds(),
      ], // _lockTo
    );

    // All staked amount available
    expect(
      await stack.collaterals.lina.collateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(9_000));

    // Locking more won't increase withdrawable amount
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [1], // _amounts
      [
        (await getBlockDateTime(ethers.provider))
          .plus({ years: 1 })
          .toSeconds(),
      ], // _lockTo
    );
    expect(
      await stack.collaterals.lina.collateralSystem.maxRedeemableLina(
        alice.address // user
      )
    ).to.equal(expandTo18Decimals(9_000));
  });
});
