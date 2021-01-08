import { ethers, waffle } from "hardhat";
import { expect, use } from "chai";
import { BigNumber, Contract, Signature, Wallet } from "ethers";
import {
  formatBytes32String,
  hexlify,
  splitSignature,
  zeroPad,
} from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expandTo18Decimals, uint256Max, zeroAddress } from "./utilities";

use(waffle.solidity);

const TOKEN_LOCK_TYPE_TRANSFER: number = 1;
const TOKEN_LOCK_TYPE_MINT_BURN: number = 2;

describe("LnErc20Bridge", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    bob: SignerWithAddress,
    relayer: Wallet;

  let lina: Contract, lusd: Contract, lnErc20Bridge: Contract;

  let currentChainId: BigNumber,
    mockChainId: BigNumber = BigNumber.from(9999);

  const createSignature = async (
    signer: Wallet,
    srcChainId: BigNumber,
    destChainId: BigNumber,
    depositId: BigNumber,
    depositor: string,
    recipient: string,
    currency: string,
    amount: BigNumber
  ): Promise<Signature> => {
    const domain = {
      name: "Linear",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: lnErc20Bridge.address,
    };

    const types = {
      Deposit: [
        { name: "srcChainId", type: "uint256" },
        { name: "destChainId", type: "uint256" },
        { name: "depositId", type: "uint256" },
        { name: "depositor", type: "bytes32" },
        { name: "recipient", type: "bytes32" },
        { name: "currency", type: "bytes32" },
        { name: "amount", type: "uint256" },
      ],
    };

    const value = {
      srcChainId,
      destChainId,
      depositId,
      depositor,
      recipient,
      currency,
      amount,
    };

    const signatureHex = await signer._signTypedData(domain, types, value);

    return splitSignature(signatureHex);
  };

  beforeEach(async function () {
    [deployer, admin, alice, bob] = await ethers.getSigners();
    relayer = Wallet.createRandom();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
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

    lnErc20Bridge = await LnErc20Bridge.deploy();
    await lnErc20Bridge.connect(deployer).__LnErc20Bridge_init(
      relayer.address, // _relayer
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
  });

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
      .withArgs(alice.address, lnErc20Bridge.address, expandTo18Decimals(1_000))
      .and.emit(lnErc20Bridge, "TokenDeposited")
      .withArgs(
        currentChainId, // srcChainId
        mockChainId, // destChainId
        1, // depositId
        hexlify(zeroPad(alice.address, 32)), // depositor
        hexlify(zeroPad(alice.address, 32)), // recipient
        formatBytes32String("LINA"), // currency
        expandTo18Decimals(1_000) // amount
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
        expandTo18Decimals(1_000) // amount
      );

    expect(await lusd.balanceOf(alice.address)).to.equal(
      expandTo18Decimals(999_000)
    );
    expect(await lusd.balanceOf(lnErc20Bridge.address)).to.equal(0);
  });

  it("cannot withdraw with invalid signature", async () => {
    // Signature with wrong depositId
    const signature = await createSignature(
      relayer, // signer
      mockChainId, // srcChainId
      currentChainId, // destChainId
      BigNumber.from(999), // depositId
      hexlify(zeroPad(alice.address, 32)), // depositor
      hexlify(zeroPad(alice.address, 32)), // recipient
      formatBytes32String("LINA"), // currency
      expandTo18Decimals(1_000) // amount
    );

    await expect(
      lnErc20Bridge.connect(alice).withdraw(
        mockChainId, // srcChainId
        currentChainId, // destChainId
        BigNumber.from(1), // depositId
        hexlify(zeroPad(alice.address, 32)), // depositor
        hexlify(zeroPad(alice.address, 32)), // recipient
        formatBytes32String("LINA"), // currency
        expandTo18Decimals(1000), // amount
        signature.v, // v
        signature.r, // r
        signature.s // s
      )
    ).to.revertedWith("LnErc20Bridge: invalid signature");
  });

  it("token tranferred on withdrawal of token in transfer mode", async () => {
    const signature = await createSignature(
      relayer, // signer
      mockChainId, // srcChainId
      currentChainId, // destChainId
      BigNumber.from(1), // depositId
      hexlify(zeroPad(alice.address, 32)), // depositor
      hexlify(zeroPad(alice.address, 32)), // recipient
      formatBytes32String("LINA"), // currency
      expandTo18Decimals(1_000) // amount
    );

    await expect(
      lnErc20Bridge.connect(alice).withdraw(
        mockChainId, // srcChainId
        currentChainId, // destChainId
        BigNumber.from(1), // depositId
        hexlify(zeroPad(alice.address, 32)), // depositor
        hexlify(zeroPad(alice.address, 32)), // recipient
        formatBytes32String("LINA"), // currency
        expandTo18Decimals(1000), // amount
        signature.v, // v
        signature.r, // r
        signature.s // s
      )
    )
      .to.emit(lina, "Transfer")
      .withArgs(lnErc20Bridge.address, alice.address, expandTo18Decimals(1_000))
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
    const signature = await createSignature(
      relayer, // signer
      mockChainId, // srcChainId
      currentChainId, // destChainId
      BigNumber.from(1), // depositId
      hexlify(zeroPad(alice.address, 32)), // depositor
      hexlify(zeroPad(alice.address, 32)), // recipient
      formatBytes32String("lUSD"), // currency
      expandTo18Decimals(1_000) // amount
    );

    await expect(
      lnErc20Bridge.connect(alice).withdraw(
        mockChainId, // srcChainId
        currentChainId, // destChainId
        BigNumber.from(1), // depositId
        hexlify(zeroPad(alice.address, 32)), // depositor
        hexlify(zeroPad(alice.address, 32)), // recipient
        formatBytes32String("lUSD"), // currency
        expandTo18Decimals(1000), // amount
        signature.v, // v
        signature.r, // r
        signature.s // s
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
    const signature = await createSignature(
      relayer, // signer
      mockChainId, // srcChainId
      currentChainId, // destChainId
      BigNumber.from(1), // depositId
      hexlify(zeroPad(alice.address, 32)), // depositor
      hexlify(zeroPad(alice.address, 32)), // recipient
      formatBytes32String("LINA"), // currency
      expandTo18Decimals(1_000) // amount
    );

    // The first withdrawal is successful
    await lnErc20Bridge.connect(alice).withdraw(
      mockChainId, // srcChainId
      currentChainId, // destChainId
      BigNumber.from(1), // depositId
      hexlify(zeroPad(alice.address, 32)), // depositor
      hexlify(zeroPad(alice.address, 32)), // recipient
      formatBytes32String("LINA"), // currency
      expandTo18Decimals(1000), // amount
      signature.v, // v
      signature.r, // r
      signature.s // s
    );

    await expect(
      lnErc20Bridge.connect(alice).withdraw(
        mockChainId, // srcChainId
        currentChainId, // destChainId
        BigNumber.from(1), // depositId
        hexlify(zeroPad(alice.address, 32)), // depositor
        hexlify(zeroPad(alice.address, 32)), // recipient
        formatBytes32String("LINA"), // currency
        expandTo18Decimals(1000), // amount
        signature.v, // v
        signature.r, // r
        signature.s // s
      )
    ).to.revertedWith("LnErc20Bridge: already withdrawn");
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
        expandTo18Decimals(1_000) // amount
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
        expandTo18Decimals(1_000) // amount
      );

    expect(await lnErc20Bridge.depositCount()).to.equal(2);
  });
});
