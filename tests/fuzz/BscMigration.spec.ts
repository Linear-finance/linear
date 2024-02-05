import { expect } from "chai";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import {
  formatBytes32String,
  Interface,
  LogDescription,
} from "ethers/lib/utils";

import { expandTo18Decimals, uint256Max } from "../utilities";
import { deployLinearStack, DeployedStack } from "../utilities/init";
import { getBlockDateTime } from "../utilities/timeTravel";

import LnDebtSystem from "../../artifacts/contracts/LnDebtSystem.sol/LnDebtSystem.json";

describe("Fuzz | BscMigration", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    charlie: SignerWithAddress,
    david: SignerWithAddress;

  let stack: DeployedStack;

  const lnDebtSystemInterface = new Interface(LnDebtSystem.abi);

  beforeEach(async function () {
    [deployer, alice, bob, charlie, david] = await ethers.getSigners();
    admin = deployer;

    stack = await deployLinearStack(deployer, admin);

    // Set LINA price to $1
    await stack.lnPrices.connect(admin).setPrice(
      ethers.utils.formatBytes32String("LINA"), // currencyKey
      expandTo18Decimals(1) // price
    );

    // All users stake 1M LINA
    for (const user of [alice, bob, charlie, david]) {
      await stack.linaToken
        .connect(admin)
        .mint(user.address, expandTo18Decimals(1_000_000));
      await stack.linaToken
        .connect(user)
        .approve(stack.lnCollateralSystem.address, uint256Max);
      await stack.lnCollateralSystem
        .connect(user)
        .Collateral(formatBytes32String("LINA"), expandTo18Decimals(1_000_000));
    }
  });

  it("debt import should emit the same events and result in the same state", async () => {
    const snapshotId = await ethers.provider.send("evm_snapshot", []);

    const users = [alice, bob, charlie, david];

    const updateUserDebtLogs: LogDescription[] = [];
    const pushDebtLogs: LogDescription[] = [];

    // Perform 100 random actions
    for (let count = 0; count < 100; count++) {
      const user: SignerWithAddress =
        users[Math.floor(Math.random() * users.length)];

      const currentCollateralAmount: BigNumber = await stack.lusdToken.balanceOf(
        user.address
      );

      const isBuild: boolean =
        currentCollateralAmount.isZero() || Math.random() < 0.5;

      let actionTx: any;

      if (isBuild) {
        const amountToBuild: BigNumber = expandTo18Decimals(
          Math.round(Math.random() * 9999 + 1)
        );

        actionTx = await stack.lnBuildBurnSystem
          .connect(user)
          .BuildAsset(amountToBuild);
      } else {
        let amountToBurn: BigNumber = currentCollateralAmount.div(
          BigNumber.from(Math.floor(Math.random() * 10 + 1))
        );
        if (amountToBurn.isZero()) amountToBurn = currentCollateralAmount;

        actionTx = await stack.lnBuildBurnSystem
          .connect(user)
          .BurnAsset(amountToBurn);
      }

      const logsFromTx: LogDescription[] = (await actionTx.wait()).events
        .filter((item) => item.address === stack.lnDebtSystem.address)
        .map((item) => lnDebtSystemInterface.parseLog(item));

      logsFromTx.forEach((item) => {
        if (item.name === "UpdateUserDebtLog") {
          updateUserDebtLogs.push(item);
        } else if (item.name === "PushDebtLog") {
          pushDebtLogs.push(item);
        }
      });
    }

    // Record contract state
    const contractState = {
      userDebtState: {
        alice: await stack.lnDebtSystem.userDebtState(alice.address),
        bob: await stack.lnDebtSystem.userDebtState(bob.address),
        charlie: await stack.lnDebtSystem.userDebtState(charlie.address),
        david: await stack.lnDebtSystem.userDebtState(david.address),
      },
      debtCurrentIndex: await stack.lnDebtSystem.debtCurrentIndex(),
      lastCloseAt: await stack.lnDebtSystem.lastCloseAt(),
      lastDeletTo: await stack.lnDebtSystem.lastDeletTo(),
    };

    // Revert EVM state and import debt data based on events collected
    await ethers.provider.send("evm_revert", [snapshotId]);

    const importUpdateUserDebtLogs: LogDescription[] = [];
    const importPushDebtLogs: LogDescription[] = [];

    for (const userDebtEvent of updateUserDebtLogs) {
      const importTx = await stack.lnDebtSystem
        .connect(admin)
        .importDebtData(
          [userDebtEvent.args.addr],
          [userDebtEvent.args.debtProportion],
          [userDebtEvent.args.debtFactor],
          [userDebtEvent.args.timestamp]
        );

      const logsFromTx: LogDescription[] = (await importTx.wait()).events
        .filter((item) => item.address === stack.lnDebtSystem.address)
        .map((item) => lnDebtSystemInterface.parseLog(item));

      logsFromTx.forEach((item) => {
        if (item.name === "UpdateUserDebtLog") {
          importUpdateUserDebtLogs.push(item);
        } else if (item.name === "PushDebtLog") {
          importPushDebtLogs.push(item);
        }
      });
    }

    // Contract state after import
    const importContractState = {
      userDebtState: {
        alice: await stack.lnDebtSystem.userDebtState(alice.address),
        bob: await stack.lnDebtSystem.userDebtState(bob.address),
        charlie: await stack.lnDebtSystem.userDebtState(charlie.address),
        david: await stack.lnDebtSystem.userDebtState(david.address),
      },
      debtCurrentIndex: await stack.lnDebtSystem.debtCurrentIndex(),
      lastCloseAt: await stack.lnDebtSystem.lastCloseAt(),
      lastDeletTo: await stack.lnDebtSystem.lastDeletTo(),
    };

    // Events emitted must be exactly the same
    expect(importUpdateUserDebtLogs.length).to.equal(updateUserDebtLogs.length);
    expect(importPushDebtLogs.length).to.equal(pushDebtLogs.length);

    updateUserDebtLogs.forEach((item, indEvent) => {
      const importEvent = importUpdateUserDebtLogs[indEvent];
      expect(importEvent.signature).to.equal(item.signature);
      item.args.forEach((arg, indArg) => {
        expect(importEvent.args[indArg]).to.equal(arg);
      });
    });

    pushDebtLogs.forEach((item, indEvent) => {
      const importEvent = importPushDebtLogs[indEvent];
      expect(importEvent.signature).to.equal(item.signature);
      item.args.forEach((arg, indArg) => {
        expect(importEvent.args[indArg]).to.equal(arg);
      });
    });

    // Contract state must be the same
    expect(importContractState.userDebtState.alice[0]).to.equal(
      contractState.userDebtState.alice[0]
    );
    expect(importContractState.userDebtState.alice[1]).to.equal(
      contractState.userDebtState.alice[1]
    );
    expect(importContractState.userDebtState.bob[0]).to.equal(
      contractState.userDebtState.bob[0]
    );
    expect(importContractState.userDebtState.bob[1]).to.equal(
      contractState.userDebtState.bob[1]
    );
    expect(importContractState.userDebtState.charlie[0]).to.equal(
      contractState.userDebtState.charlie[0]
    );
    expect(importContractState.userDebtState.charlie[1]).to.equal(
      contractState.userDebtState.charlie[1]
    );
    expect(importContractState.userDebtState.david[0]).to.equal(
      contractState.userDebtState.david[0]
    );
    expect(importContractState.userDebtState.david[1]).to.equal(
      contractState.userDebtState.david[1]
    );
    expect(importContractState.debtCurrentIndex).to.equal(
      contractState.debtCurrentIndex
    );
    expect(importContractState.lastCloseAt).to.equal(contractState.lastCloseAt);
    expect(importContractState.lastDeletTo).to.equal(contractState.lastDeletTo);
  });
});
