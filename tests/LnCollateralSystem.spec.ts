import { ethers, waffle } from "hardhat";
import { expect, use } from "chai";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";
import { expandTo18Decimals, zeroAddress } from "./utilities";

const { formatBytes32String } = ethers.utils;

use(waffle.solidity);

describe("LnCollateralSystem", function () {
  let deployer: SignerWithAddress,
    admin: SignerWithAddress,
    alice: SignerWithAddress,
    rewarder: SignerWithAddress,
    rewardLocker: SignerWithAddress;

  let lnCollateralSystem: Contract, linaToken: Contract;

  const mockLnPricesAddr = "0x0000000000000000000000000000000000000001";
  const mockLnDebtSystemAddr = "0x0000000000000000000000000000000000000002";
  const mockLnConfigAddr = "0x0000000000000000000000000000000000000003";
  const mockLnBuildBurnSystemAddr =
    "0x0000000000000000000000000000000000000004";
  const mockLnLiquidationAddr = "0x0000000000000000000000000000000000000005";

  beforeEach(async function () {
    [
      deployer,
      admin,
      alice,
      rewarder,
      rewardLocker,
    ] = await ethers.getSigners();

    const LnAccessControl = await ethers.getContractFactory("LnAccessControl");
    const LnCollateralSystem = await ethers.getContractFactory(
      "LnCollateralSystem"
    );
    const LnAssetSystem = await ethers.getContractFactory("LnAssetSystem");
    const LINAToken = await ethers.getContractFactory("MockERC20");

    lnCollateralSystem = await LnCollateralSystem.deploy();
    await lnCollateralSystem.connect(deployer).__LnCollateralSystem_init(
      admin.address, // _admin
      mockLnPricesAddr, // _priceGetter
      mockLnDebtSystemAddr, // _debtSystem
      mockLnConfigAddr, // _mConfig
      rewardLocker.address, // _mRewardLocker
      mockLnBuildBurnSystemAddr, // _buildBurnSystem
      mockLnLiquidationAddr // _liquidation
    );

    linaToken = await LINAToken.deploy(
      "Linear Finance", // _name
      "LINA", // _symbol
      18 // _decimals
    );

    await lnCollateralSystem
      .connect(admin)
      .updateTokenInfo(
        formatBytes32String("LINA"),
        linaToken.address,
        1,
        false
      );
  });

  it("only reward locker can call collateralFromUnlockReward function", async () => {
    await expect(
      lnCollateralSystem
        .connect(alice)
        .collateralFromUnlockReward(
          alice.address,
          rewarder.address,
          ethers.utils.formatBytes32String("LINA"),
          1
        )
    ).to.be.revertedWith("LnCollateralSystem: not reward locker");

    await linaToken.mint(rewarder.address, expandTo18Decimals(10));
    await linaToken
      .connect(rewarder)
      .approve(lnCollateralSystem.address, expandTo18Decimals(10));

    await lnCollateralSystem
      .connect(rewardLocker)
      .collateralFromUnlockReward(
        alice.address,
        rewarder.address,
        ethers.utils.formatBytes32String("LINA"),
        expandTo18Decimals(10)
      );

    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        ethers.utils.formatBytes32String("LINA")
      )
    ).to.eq(expandTo18Decimals(10));
  });

  it("reward locker can send reward to collateral system upon reward locked", async () => {
    await linaToken.mint(rewarder.address, expandTo18Decimals(10));
    await linaToken
      .connect(rewarder)
      .approve(lnCollateralSystem.address, expandTo18Decimals(10));

    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        ethers.utils.formatBytes32String("LINA")
      )
    ).to.eq(BigNumber.from("0"));
    expect(await linaToken.balanceOf(lnCollateralSystem.address)).to.eq(
      BigNumber.from("0")
    );

    await expect(
      lnCollateralSystem
        .connect(rewardLocker)
        .collateralFromUnlockReward(
          alice.address,
          rewarder.address,
          ethers.utils.formatBytes32String("LINA"),
          expandTo18Decimals(10)
        )
    )
      .to.emit(lnCollateralSystem, "CollateralUnlockReward")
      .withArgs(
        alice.address,
        ethers.utils.formatBytes32String("LINA"),
        expandTo18Decimals(10),
        expandTo18Decimals(10)
      )
      .to.emit(linaToken, "Transfer")
      .withArgs(
        rewarder.address,
        lnCollateralSystem.address,
        expandTo18Decimals(10)
      );

    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        ethers.utils.formatBytes32String("LINA")
      )
    ).to.eq(expandTo18Decimals(10));
    let tokeninfo = await lnCollateralSystem.tokenInfos(
      ethers.utils.formatBytes32String("LINA")
    );
    expect(tokeninfo.totalCollateral).to.equal(expandTo18Decimals(10));

    expect(await linaToken.balanceOf(lnCollateralSystem.address)).to.eq(
      expandTo18Decimals(10)
    );
  });

  it("reward locker must pass a user address to collateralFromUnlockReward function", async () => {
    await expect(
      lnCollateralSystem
        .connect(rewardLocker)
        .collateralFromUnlockReward(
          "0x0000000000000000000000000000000000000000",
          rewarder.address,
          ethers.utils.formatBytes32String("LINA"),
          expandTo18Decimals(10)
        )
    ).to.be.revertedWith("LnCollateralSystem: User address cannot be zero");
  });

  it("reward locker must pass a valid currency to collateralFromUnlockReward function", async () => {
    let ethTokeninfo = await lnCollateralSystem.tokenInfos(
      ethers.utils.formatBytes32String("ETH")
    );
    expect(ethTokeninfo.tokenAddr).to.be.eq(zeroAddress);

    await expect(
      lnCollateralSystem
        .connect(rewardLocker)
        .collateralFromUnlockReward(
          alice.address,
          rewarder.address,
          ethers.utils.formatBytes32String("ETH"),
          expandTo18Decimals(10)
        )
    ).to.be.revertedWith("LnCollateralSystem: currency symbol mismatch");

    let linaTokeninfo = await lnCollateralSystem.tokenInfos(
      ethers.utils.formatBytes32String("LINA")
    );
    expect(linaTokeninfo.tokenAddr).to.be.eq(linaToken.address);

    await linaToken.mint(rewarder.address, expandTo18Decimals(1));
    await linaToken
      .connect(rewarder)
      .approve(lnCollateralSystem.address, expandTo18Decimals(1));

    await lnCollateralSystem
      .connect(rewardLocker)
      .collateralFromUnlockReward(
        alice.address,
        rewarder.address,
        ethers.utils.formatBytes32String("LINA"),
        expandTo18Decimals(1)
      );

    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        ethers.utils.formatBytes32String("LINA")
      )
    ).to.eq(expandTo18Decimals(1));
  });

  it("reward locker must pass amount > 0 to collateralFromUnlockReward function", async () => {
    await expect(
      lnCollateralSystem
        .connect(rewardLocker)
        .collateralFromUnlockReward(
          alice.address,
          rewarder.address,
          ethers.utils.formatBytes32String("LINA"),
          BigNumber.from(0)
        )
    ).to.be.revertedWith("LnCollateralSystem: Collateral amount must be > 0");

    await linaToken.mint(rewarder.address, expandTo18Decimals(1));
    await linaToken
      .connect(rewarder)
      .approve(lnCollateralSystem.address, expandTo18Decimals(1));

    await lnCollateralSystem
      .connect(rewardLocker)
      .collateralFromUnlockReward(
        alice.address,
        rewarder.address,
        ethers.utils.formatBytes32String("LINA"),
        expandTo18Decimals(1)
      );

    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        ethers.utils.formatBytes32String("LINA")
      )
    ).to.eq(expandTo18Decimals(1));
  });

  it("collateralFromUnlockReward will fail if rewarder doesn't have sufficient balance", async () => {
    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        ethers.utils.formatBytes32String("LINA")
      )
    ).to.eq(BigNumber.from("0"));
    expect(await linaToken.balanceOf(lnCollateralSystem.address)).to.eq(
      BigNumber.from("0")
    );
    expect(await linaToken.balanceOf(rewarder.address)).to.eq(
      BigNumber.from("0")
    );

    await expect(
      lnCollateralSystem
        .connect(rewardLocker)
        .collateralFromUnlockReward(
          alice.address,
          rewarder.address,
          ethers.utils.formatBytes32String("LINA"),
          expandTo18Decimals(10)
        )
    ).to.be.revertedWith("TransferHelper: transferFrom failed");
  });
});
