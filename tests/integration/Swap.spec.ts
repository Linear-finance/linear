import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expect } from "chai";
import { ethers } from "hardhat";
import { expandTo18Decimals } from "../utilities";
import { DeployedStack, deployLinearStack } from "../utilities/init";
import { getBlockDateTime } from "../utilities/timeTravel";

describe("Integration | Swap", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress;

  let stack: DeployedStack;

  beforeEach(async function () {
    [deployer, alice] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);
  });

  it("can swap LINA", async function () {
    // Mint and approve 10,000 LINA for Alice
    await stack.linaToken.connect(admin).mint(
      alice.address, // account
      expandTo18Decimals(10_000) // amounts
    );

    await stack.linaToken.connect(alice).approve(
      stack.lnErc20Bridge.address, // spender
      expandTo18Decimals(10_000) // amounts
    );

    // Alice freeze 10,000 LINA in contract
    let tx = await stack.lnErc20Bridge.connect(alice).freeze(
      expandTo18Decimals(10_000) // amounts
    );

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(0)
    );

    expect(await stack.lnErc20Bridge.getTotalFrozenToken()).to.equal(
      expandTo18Decimals(10_000)
    );
    //Set freeze log
    await stack.lnErc20Bridge.connect(admin).setFreezeTx(
      alice.address, //_account
      tx.hash, //_txID
      expandTo18Decimals(10_000), // _amounts
      (await getBlockDateTime(ethers.provider)).toSeconds() //_timestamp
    );
    let pendingProcess = await stack.lnErc20Bridge.getPendingProcess(
      alice.address
    );
    expect(pendingProcess[0]).to.equal(tx.hash);

    //Unfreeze 10,000 LINA for Alice
    await stack.lnErc20Bridge.connect(alice).unfreeze(
      tx.hash //_txID
    );

    expect(await stack.linaToken.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(10_000)
    );

    expect(await stack.lnErc20Bridge.getTotalFrozenToken()).to.equal(
      expandTo18Decimals(0)
    );

    //Can't re-entrance  Tx Log
    await expect(
      stack.lnErc20Bridge.connect(admin).setFreezeTx(
        alice.address, //_account
        tx.hash, //_txID
        expandTo18Decimals(10_000), // _amounts
        (await getBlockDateTime(ethers.provider)).toSeconds() //_timestamp
      )
    ).to.be.revertedWith("txId already exist");

    //Can't  unfreeze the same bridge transaction twice
    await expect(
      stack.lnErc20Bridge.connect(alice).unfreeze(
        tx.hash //_txID
      )
    ).to.be.revertedWith("this transaction already done");
  });
});
