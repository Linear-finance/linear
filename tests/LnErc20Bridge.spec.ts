import { ethers, waffle } from "hardhat";
import { expect, use } from "chai";
import { BigNumber, Wallet } from "ethers";
import {
  formatBytes32String,
  hexConcat,
  hexlify,
  zeroPad,
} from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expandTo18Decimals, uint256Max, zeroAddress } from "./utilities";

import { LnErc20Bridge, MockERC20, MockWormhole } from "../typechain";

use(waffle.solidity);

const TOKEN_LOCK_TYPE_TRANSFER: number = 1;
const TOKEN_LOCK_TYPE_MINT_BURN: number = 2;

describe("LnErc20Bridge", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress;

  let lina: MockERC20,
    lusd: MockERC20,
    wormhole: MockWormhole,
    lnErc20Bridge: LnErc20Bridge;

  let currentChainId: BigNumber,
    mockChainId: BigNumber = BigNumber.from(9999),
    mockWormholeNetworkId: BigNumber = BigNumber.from(5);

  const mockBridgeAddress: string =
    "0x000000000000000000000000000000000000dead";

  const generatePayload = (
    srcChainId: BigNumber,
    destChainId: BigNumber,
    depositId: BigNumber,
    depositor: string,
    recipient: string,
    currency: string,
    amount: BigNumber
  ): string => {
    return hexConcat([
      hexlify(zeroPad(srcChainId.toHexString(), 32)),
      hexlify(zeroPad(destChainId.toHexString(), 32)),
      hexlify(zeroPad(depositId.toHexString(), 32)),
      hexlify(zeroPad(depositor, 32)),
      hexlify(zeroPad(recipient, 32)),
      formatBytes32String(currency),
      hexlify(zeroPad(amount.toHexString(), 32)),
    ]);
  };

  beforeEach(async function () {
    [deployer, admin, alice] = await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    const MockWormhole = await ethers.getContractFactory("MockWormhole");
    const LnErc20Bridge = await ethers.getContractFactory("LnErc20Bridge");

    currentChainId = BigNumber.from(
      (await ethers.provider.getNetwork()).chainId
    );

    lina = await MockERC20.deploy(
      "Linear Token", // _name
      "LINA" // _symbol
    );
    lusd = await MockERC20.deploy(
      "lUSD", // _name
      "lUSD" // _symbol
    );

    wormhole = await MockWormhole.deploy();

    lnErc20Bridge = await LnErc20Bridge.deploy();
    await lnErc20Bridge.connect(deployer).__LnErc20Bridge_init(
      admin.address // _admin
    );

    // Bridge does NOT need to hold any lUSD (mint/burn mode)
    await lina
      .connect(deployer)
      .mint(alice.address, expandTo18Decimals(1_000_000));
    await lina
      .connect(deployer)
      .mint(lnErc20Bridge.address, expandTo18Decimals(1_000_000));
    await lusd
      .connect(deployer)
      .mint(alice.address, expandTo18Decimals(1_000_000));

    await lina.connect(alice).approve(lnErc20Bridge.address, uint256Max);

    await lnErc20Bridge.connect(admin).addToken(
      formatBytes32String("LINA"), // tokenKey
      lina.address, // tokenAddress
      TOKEN_LOCK_TYPE_TRANSFER // lockType
    );
    await lnErc20Bridge.connect(admin).addToken(
      formatBytes32String("lUSD"), // tokenKey
      lusd.address, // tokenAddress
      TOKEN_LOCK_TYPE_MINT_BURN // lockType
    );
    await lnErc20Bridge.connect(admin).addChainSupportForToken(
      formatBytes32String("LINA"), // tokenKey
      mockChainId // chainId
    );
    await lnErc20Bridge.connect(admin).addChainSupportForToken(
      formatBytes32String("lUSD"), // tokenKey
      mockChainId // chainId
    );

    await lnErc20Bridge.connect(admin).setUpWormhole(
      wormhole.address, // _coreContract
      15 // _consistencyLevel
    );
    await lnErc20Bridge.connect(admin).setBridgeAddressForChain(
      mockChainId, // chainId
      mockBridgeAddress // bridgeAddress
    );
  });

  describe("Deposit", function () {
    it("cannot deposit with unsupported token", async () => {
      await expect(
        lnErc20Bridge.connect(alice).deposit(
          formatBytes32String("NOTFOUND"), // token
          expandTo18Decimals(1_000), // amount
          mockChainId, // destChainId
          hexlify(zeroPad(alice.address, 32)) // recipient
        )
      ).to.revertedWith("LnErc20Bridge: token not found");
    });

    it("cannot deposit for unsupported chain", async () => {
      await expect(
        lnErc20Bridge.connect(alice).deposit(
          formatBytes32String("LINA"), // token
          expandTo18Decimals(1_000), // amount
          BigNumber.from(8888), // destChainId
          hexlify(zeroPad(alice.address, 32)) // recipient
        )
      ).to.revertedWith("LnErc20Bridge: token not supported on chain");
    });

    it("token tranferred on deposit of token in transfer mode", async () => {
      await expect(
        lnErc20Bridge.connect(alice).deposit(
          formatBytes32String("LINA"), // token
          expandTo18Decimals(1_000), // amount
          mockChainId, // destChainId
          hexlify(zeroPad(alice.address, 32)) // recipient
        )
      )
        .to.emit(lina, "Transfer")
        .withArgs(
          alice.address,
          lnErc20Bridge.address,
          expandTo18Decimals(1_000)
        )
        .and.emit(lnErc20Bridge, "TokenDeposited")
        .withArgs(
          currentChainId, // srcChainId
          mockChainId, // destChainId
          1, // depositId
          hexlify(zeroPad(alice.address, 32)), // depositor
          hexlify(zeroPad(alice.address, 32)), // recipient
          formatBytes32String("LINA"), // currency
          expandTo18Decimals(1_000), // amount
          0 // wormholeSequence
        );

      expect(await lina.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(999_000)
      );
      expect(await lina.balanceOf(lnErc20Bridge.address)).to.equal(
        expandTo18Decimals(1_001_000)
      );
    });

    it("token burnt on deposit of token in mint/burn mode", async () => {
      await expect(
        lnErc20Bridge.connect(alice).deposit(
          formatBytes32String("lUSD"), // token
          expandTo18Decimals(1_000), // amount
          mockChainId, // destChainId
          hexlify(zeroPad(alice.address, 32)) // recipient
        )
      )
        .to.emit(lusd, "Transfer")
        .withArgs(alice.address, zeroAddress, expandTo18Decimals(1_000))
        .and.emit(lnErc20Bridge, "TokenDeposited")
        .withArgs(
          currentChainId, // srcChainId
          mockChainId, // destChainId
          1, // depositId
          hexlify(zeroPad(alice.address, 32)), // depositor
          hexlify(zeroPad(alice.address, 32)), // recipient
          formatBytes32String("lUSD"), // currency
          expandTo18Decimals(1_000), // amount
          0 // wormholeSequence
        );

      expect(await lusd.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(999_000)
      );
      expect(await lusd.balanceOf(lnErc20Bridge.address)).to.equal(0);
    });

    it("depositId should increment on each deposit", async () => {
      expect(await lnErc20Bridge.depositCount()).to.equal(0);

      await expect(
        lnErc20Bridge.connect(alice).deposit(
          formatBytes32String("lUSD"), // token
          expandTo18Decimals(1_000), // amount
          mockChainId, // destChainId
          hexlify(zeroPad(alice.address, 32)) // recipient
        )
      )
        .to.emit(lnErc20Bridge, "TokenDeposited")
        .withArgs(
          currentChainId, // srcChainId
          mockChainId, // destChainId
          1, // depositId
          hexlify(zeroPad(alice.address, 32)), // depositor
          hexlify(zeroPad(alice.address, 32)), // recipient
          formatBytes32String("lUSD"), // currency
          expandTo18Decimals(1_000), // amount
          0 // wormholeSequence
        );

      expect(await lnErc20Bridge.depositCount()).to.equal(1);

      await expect(
        lnErc20Bridge.connect(alice).deposit(
          formatBytes32String("lUSD"), // token
          expandTo18Decimals(1_000), // amount
          mockChainId, // destChainId
          hexlify(zeroPad(alice.address, 32)) // recipient
        )
      )
        .to.emit(lnErc20Bridge, "TokenDeposited")
        .withArgs(
          currentChainId, // srcChainId
          mockChainId, // destChainId
          2, // depositId
          hexlify(zeroPad(alice.address, 32)), // depositor
          hexlify(zeroPad(alice.address, 32)), // recipient
          formatBytes32String("lUSD"), // currency
          expandTo18Decimals(1_000), // amount
          1 // wormholeSequence
        );

      expect(await lnErc20Bridge.depositCount()).to.equal(2);
    });

    it("should emit expected payload on deposit", async () => {
      await lnErc20Bridge.connect(alice).deposit(
        formatBytes32String("LINA"), // token
        expandTo18Decimals(1_000), // amount
        mockChainId, // destChainId
        hexlify(zeroPad(alice.address, 32)) // recipient
      );

      const payload = await wormhole.lastPayload();
      const expectedPayload = generatePayload(
        currentChainId, // srcChainId
        mockChainId, // destChainId
        BigNumber.from(1), // depositId
        alice.address, // depositor
        alice.address, // recipient
        "LINA", // currency
        expandTo18Decimals(1_000) // amount
      );

      expect(payload).to.equal(expectedPayload);
    });
  });

  describe("Withdrawal", function () {
    let payload: string;

    // This doesn't matter as it's discarded by the mock Wormhole contract.
    const mockWormholeMessage: string = "0x1234";

    beforeEach(async function () {
      // Happy case payload
      payload = generatePayload(
        mockChainId, // srcChainId
        currentChainId, // destChainId
        BigNumber.from(1), // depositId
        alice.address, // depositor
        alice.address, // recipient
        "LINA", // currency
        expandTo18Decimals(1_000) // amount
      );

      await wormhole.connect(admin).setVmToReturn(
        mockWormholeNetworkId, // emitterChainId
        hexlify(zeroPad(mockBridgeAddress, 32)), // emitterAddress,
        payload // payload
      );

      await lnErc20Bridge.connect(admin).setWormholeNetworkIdForChain(
        mockChainId, // chainId
        mockWormholeNetworkId // wormholeNetworkId
      );
    });

    it("cannot withdraw if wormhole verification fails", async () => {
      await wormhole.connect(admin).setShouldFailVerification(true);

      await expect(
        lnErc20Bridge.connect(alice).withdraw(
          mockWormholeMessage // encodedWormholeMessage
        )
      ).to.revertedWith("LnErc20Bridge: wormhole message verification failed");
    });

    it("cannot withdraw if emitted from wrong network", async () => {
      await wormhole.connect(admin).setVmToReturn(
        mockWormholeNetworkId.add(1), // emitterChainId
        hexlify(zeroPad(mockBridgeAddress, 32)), // emitterAddress,
        payload // payload
      );

      await expect(
        lnErc20Bridge.connect(alice).withdraw(
          mockWormholeMessage // encodedWormholeMessage
        )
      ).to.revertedWith("LnErc20Bridge: network id mismatch");
    });

    it("cannot withdraw if emitted from wrong address", async () => {
      await wormhole.connect(admin).setVmToReturn(
        mockWormholeNetworkId, // emitterChainId
        hexlify(zeroPad(mockBridgeAddress.replace("e", "a"), 32)), // emitterAddress,
        payload // payload
      );

      await expect(
        lnErc20Bridge.connect(alice).withdraw(
          mockWormholeMessage // encodedWormholeMessage
        )
      ).to.revertedWith("LnErc20Bridge: emitter mismatch");
    });

    it("cannot withdraw if payload dest chain is wrong", async () => {
      payload = generatePayload(
        mockChainId, // srcChainId
        currentChainId.add(1), // destChainId
        BigNumber.from(1), // depositId
        alice.address, // depositor
        alice.address, // recipient
        "LINA", // currency
        expandTo18Decimals(1_000) // amount
      );

      await wormhole.connect(admin).setVmToReturn(
        mockWormholeNetworkId, // emitterChainId
        hexlify(zeroPad(mockBridgeAddress, 32)), // emitterAddress,
        payload // payload
      );

      await expect(
        lnErc20Bridge.connect(alice).withdraw(
          mockWormholeMessage // encodedWormholeMessage
        )
      ).to.revertedWith("LnErc20Bridge: wrong chain");
    });

    it("token tranferred on withdrawal of token in transfer mode", async () => {
      await expect(
        lnErc20Bridge.connect(alice).withdraw(
          mockWormholeMessage // encodedWormholeMessage
        )
      )
        .to.emit(lina, "Transfer")
        .withArgs(
          lnErc20Bridge.address,
          alice.address,
          expandTo18Decimals(1_000)
        )
        .and.emit(lnErc20Bridge, "TokenWithdrawn")
        .withArgs(
          mockChainId, // srcChainId
          currentChainId, // destChainId
          1, // depositId
          hexlify(zeroPad(alice.address, 32)), // depositor
          hexlify(zeroPad(alice.address, 32)), // recipient
          formatBytes32String("LINA"), // currency
          expandTo18Decimals(1_000) // amount
        );

      expect(await lina.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(1_001_000)
      );
      expect(await lina.balanceOf(lnErc20Bridge.address)).to.equal(
        expandTo18Decimals(999_000)
      );
    });

    it("token minted on withdrawal of token in mint/burn mode", async () => {
      payload = generatePayload(
        mockChainId, // srcChainId
        currentChainId, // destChainId
        BigNumber.from(1), // depositId
        alice.address, // depositor
        alice.address, // recipient
        "lUSD", // currency
        expandTo18Decimals(1_000) // amount
      );

      await wormhole.connect(admin).setVmToReturn(
        mockWormholeNetworkId, // emitterChainId
        hexlify(zeroPad(mockBridgeAddress, 32)), // emitterAddress,
        payload // payload
      );

      await expect(
        lnErc20Bridge.connect(alice).withdraw(
          mockWormholeMessage // encodedWormholeMessage
        )
      )
        .to.emit(lusd, "Transfer")
        .withArgs(zeroAddress, alice.address, expandTo18Decimals(1_000))
        .and.emit(lnErc20Bridge, "TokenWithdrawn")
        .withArgs(
          mockChainId, // srcChainId
          currentChainId, // destChainId
          1, // depositId
          hexlify(zeroPad(alice.address, 32)), // depositor
          hexlify(zeroPad(alice.address, 32)), // recipient
          formatBytes32String("lUSD"), // currency
          expandTo18Decimals(1_000) // amount
        );

      expect(await lusd.balanceOf(alice.address)).to.equal(
        expandTo18Decimals(1_001_000)
      );
      expect(await lusd.balanceOf(lnErc20Bridge.address)).to.equal(0);
    });

    it("cannot withdraw the same deposit multiple times", async () => {
      // The first withdrawal is successful
      await lnErc20Bridge.connect(alice).withdraw(
        mockWormholeMessage // encodedWormholeMessage
      );

      await expect(
        lnErc20Bridge.connect(alice).withdraw(
          mockWormholeMessage // encodedWormholeMessage
        )
      ).to.revertedWith("LnErc20Bridge: already withdrawn");
    });
  });
});
