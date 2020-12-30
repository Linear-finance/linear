import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { expandTo18Decimals } from "../utilities";
import { DeployedStack, deployLinearStack } from "../utilities/init";
import { getBlockDateTime } from "../utilities/timeTravel";


describe("Integration | Merge API : Stake/Build and Burn/Unstake", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress;

  let stack: DeployedStack;

  beforeEach(async function () {
    [deployer, alice] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);

    // Set LINA price to $0.01
    await stack.lnDefaultPrices.connect(admin).updateAll(
      [ethers.utils.formatBytes32String("LINA")], // currencyNames
      [expandTo18Decimals(0.01)], // newPrices
      (await getBlockDateTime(ethers.provider)).toSeconds() // timeSent
    );

    // Mint and approve 10,000 LINA for Alice
    await stack.linaToken.connect(admin).mint(
      alice.address, // account
      expandTo18Decimals(10_000) // amounts
    );

    await stack.linaToken.connect(alice).approve(
      stack.lnCollateralSystem.address, // spender
      expandTo18Decimals(10_000) // amounts
    );

  });

  it("can stake and build in one step", async function () {

    // Alice can stake and build  lUSD in one step
    await stack.lnCollateralSystem.connect(alice).collateralAndBuild(
      ethers.utils.formatBytes32String("LINA"), //_currency
      expandTo18Decimals(10_000) // _amount
    );

    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(20)
    );

    expect(await stack.lnCollateralSystem.GetUserCollateral(
      alice.address, // account
      ethers.utils.formatBytes32String("LINA")
    )).to.equal(
      expandTo18Decimals(10_000)
    );

  });

  it("can burn and unstake in one step", async function () {

    // Alice  stake and build  lUSD in one step
    await stack.lnCollateralSystem.connect(alice).collateralAndBuild(
      ethers.utils.formatBytes32String("LINA"), //_currency
      expandTo18Decimals(10_000) // _amount
    );

    // Alice can burn and unstake  lUSD in one step
    await stack.lnCollateralSystem.connect(alice).burnAndRedeem(
      ethers.utils.formatBytes32String("LINA"), //_currency
      expandTo18Decimals(20) // _amount
    );

    expect(await stack.lusdToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(0)
    );

  });
});
