import { ethers } from "hardhat";
import { expect } from "chai";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expandTo18Decimals, nullAddress, uint256Max } from "../utilities";
import { deployLinearStack, DeployedStack } from "../utilities/init";
import { getBlockDateTime } from "../utilities/timeTravel";
import { formatBytes32String } from "ethers/lib/utils";
import { Contract } from "ethers";
import { deployErc20TokenAsCollateral } from '../utilities/deployErc20TokenAsCollateral';

describe("Integration | Build", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress;

  let stack: DeployedStack,
    busdToken: Contract;

  const linaCurrencyKey = formatBytes32String("LINA");
  const busdCurrencyKey = formatBytes32String("BUSD");
  const bnbCurrencyKey = formatBytes32String("BNB");

  beforeEach(async function () {
    [deployer, alice, bob] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);
    busdToken = await deployErc20TokenAsCollateral("Binance-Peg BUSD Token", "BUSD", stack.lnCollateralSystem, deployer, admin);

    // Set LINA price to $0.01
    await stack.lnPrices.connect(admin).setPrice(
      linaCurrencyKey, // currencyKey
      expandTo18Decimals(0.01) // price
    );

    // Set LINA price to $0.01
    await stack.lnPrices.connect(admin).setPrice(
      busdCurrencyKey, // currencyKey
      expandTo18Decimals(1) // price
    );

    // Set BNB price to $250
    await stack.lnPrices.connect(admin).setPrice(
      bnbCurrencyKey, // currencyKey
      expandTo18Decimals(250) // price
    );

    // Mint 1,000,000 LINA to Alice
    await stack.linaToken
      .connect(admin)
      .mint(alice.address, expandTo18Decimals(1_000_000));

    await stack.linaToken
      .connect(alice)
      .approve(stack.lnCollateralSystem.address, uint256Max);

    await busdToken
      .connect(admin)
      .mint(alice.address, expandTo18Decimals(1_000_000));

    await busdToken
      .connect(alice)
      .approve(stack.lnCollateralSystem.address, uint256Max);
  });

  it("can build lUSD with just locked reward", async function () {
    // Lock 10,000 LINA of rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [expandTo18Decimals(10_000)], // _amounts
      [(await getBlockDateTime(ethers.provider)).plus({ years: 1 }).toSeconds()] // _lockTo
    );

    // Alice can build 1 lUSD without staking
    await stack.lnBuildBurnSystem.connect(alice).BuildAsset(
      expandTo18Decimals(1), // amount
    );

    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(1)
    );
  });

  it("can build lUSD with other ERC20 tokens", async function () {
    await stack.lnCollateralSystem
      .connect(alice)
      .Collateral(busdCurrencyKey, expandTo18Decimals(10));

    // Alice can build 1 lUSD without staking
    await stack.lnBuildBurnSystem.connect(alice).BuildAssetByCurrency(
      expandTo18Decimals(1), // amount
      busdCurrencyKey
    );

    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(1)
    );
  });

  it("can build max amount of lUSD with other ERC20 tokens", async function () {
    await stack.lnCollateralSystem
      .connect(alice)
      .Collateral(busdCurrencyKey, expandTo18Decimals(10));

    // Alice can build 1 lUSD without staking
    await stack.lnBuildBurnSystem.connect(alice).BuildMaxAssetByCurrency(
      busdCurrencyKey
    );

    // 10 * 1 * 0.7
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(7)
    );
  });

  it("can build lUSD with native tokens", async function () {
    await stack.lnCollateralSystem.connect(admin).UpdateTokenInfo(
      bnbCurrencyKey, // _currency
      nullAddress, // _tokenAddr
      expandTo18Decimals(1), // _minCollateral
      false // _close
    );

    await stack.lnCollateralSystem
      .connect(alice)
      .Collateral(
        bnbCurrencyKey,
        expandTo18Decimals(10),
        {
          value: expandTo18Decimals(10)
        }
      );

    // Alice can build 1 lUSD without staking
    await stack.lnBuildBurnSystem.connect(alice).BuildAssetByCurrency(
      expandTo18Decimals(1), // amount
      bnbCurrencyKey
    );

    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(1)
    );
  });

  it("can build max amount of lUSD with native tokens", async function () {
    await stack.lnCollateralSystem.connect(admin).UpdateTokenInfo(
      bnbCurrencyKey, // _currency
      nullAddress, // _tokenAddr
      expandTo18Decimals(1), // _minCollateral
      false // _close
    );

    await stack.lnCollateralSystem
      .connect(alice)
      .Collateral(
        bnbCurrencyKey,
        expandTo18Decimals(10),
        {
          value: expandTo18Decimals(10)
        }
      );

    // Alice can build 1 lUSD without staking
    await stack.lnBuildBurnSystem.connect(alice).BuildMaxAssetByCurrency(
      bnbCurrencyKey
    );

    // 10 * 250 * 0.3
    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(750)
    );
  });

  it("maxRedeemable() should return staked amount when debt is zero regardless of locked collateral", async function () {
    // Alice stakes 9,000 LINA
    await stack.lnCollateralSystem.connect(alice).Collateral(
      linaCurrencyKey, // _currency
      expandTo18Decimals(9_000) // _amount
    );

    // Returns 9,000 when locked amount is zero
    expect(
      await stack.lnCollateralSystem.maxRedeemable(
        alice.address, // user
        linaCurrencyKey
      )
    ).to.equal(expandTo18Decimals(9_000));

    // Lock rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [expandTo18Decimals(9_000).sub(1)], // _amounts
      [(await getBlockDateTime(ethers.provider)).plus({ years: 1 }).toSeconds()] // _lockTo
    );

    // Returns 9,000 when locked amount is less than staked
    expect(
      await stack.lnCollateralSystem.maxRedeemable(
        alice.address, // user
        linaCurrencyKey
      )
    ).to.equal(expandTo18Decimals(9_000));

    // Lock 1 unit of LINA rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [1], // _amounts
      [(await getBlockDateTime(ethers.provider)).plus({ years: 1 }).toSeconds()] // _lockTo
    );

    // Returns 9,000 when locked amount is the same as staked
    expect(
      await stack.lnCollateralSystem.maxRedeemable(
        alice.address, // user
        linaCurrencyKey
      )
    ).to.equal(expandTo18Decimals(9_000));

    // Lock 1 unit of LINA rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [1], // _amounts
      [(await getBlockDateTime(ethers.provider)).plus({ years: 1 }).toSeconds()] // _lockTo
    );

    // Returns 9,000 when locked amount is the same as staked
    expect(
      await stack.lnCollateralSystem.maxRedeemable(
        alice.address, // user
        linaCurrencyKey
      )
    ).to.equal(expandTo18Decimals(9_000));
  });

  it("maxRedeemable() should reflect debt amount", async function () {
    // Alice stakes 9,000 LINA
    await stack.lnCollateralSystem.connect(alice).Collateral(
      linaCurrencyKey, // _currency
      expandTo18Decimals(9_000) // _amount
    );

    // Alice builds 10 lUSD
    await stack.lnBuildBurnSystem.connect(alice).BuildAsset(
      expandTo18Decimals(10), // amount
    );

    // 5,000 LINA is set aside
    expect(
      await stack.lnCollateralSystem.maxRedeemable(
        alice.address, // user
        linaCurrencyKey
      )
    ).to.equal(expandTo18Decimals(4_000));

    // Lock 4,000 LINA rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [expandTo18Decimals(4_000)], // _amounts
      [(await getBlockDateTime(ethers.provider)).plus({ years: 1 }).toSeconds()] // _lockTo
    );

    // Now 8,000 LINA is withdrawable
    expect(
      await stack.lnCollateralSystem.maxRedeemable(
        alice.address, // user
        linaCurrencyKey
      )
    ).to.equal(expandTo18Decimals(8_000));

    // Lock 1,000 LINA rewards for Alice
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [expandTo18Decimals(1_000)], // _amounts
      [(await getBlockDateTime(ethers.provider)).plus({ years: 1 }).toSeconds()] // _lockTo
    );

    // All staked amount available
    expect(
      await stack.lnCollateralSystem.maxRedeemable(
        alice.address, // user
        linaCurrencyKey
      )
    ).to.equal(expandTo18Decimals(9_000));

    // Locking more won't increase withdrawable amount
    await stack.lnRewardLocker.connect(admin).migrateRewards(
      [alice.address], // _users
      [1], // _amounts
      [(await getBlockDateTime(ethers.provider)).plus({ years: 1 }).toSeconds()] // _lockTo
    );
    expect(
      await stack.lnCollateralSystem.maxRedeemable(
        alice.address, // user
        linaCurrencyKey
      )
    ).to.equal(expandTo18Decimals(9_000));
  });
});
