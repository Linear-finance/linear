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

  let lnAccessControl: Contract,
    lnCollateralSystem: Contract,
    linaToken: Contract,
    lnAssetSystem: Contract;

  const mockLnPricesAddr = "0x0000000000000000000000000000000000000001";
  const mockLnDebtSystemAddr = "0x0000000000000000000000000000000000000002";
  const mockLnConfigAddr = "0x0000000000000000000000000000000000000003";
  const mockLnBuildBurnSystemAddr =
    "0x0000000000000000000000000000000000000004";
  const mockLnLiquidationAddr = "0x0000000000000000000000000000000000000005";
  const linaCurrencyKey = formatBytes32String("LINA");

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

    lnAccessControl = await LnAccessControl.deploy();
    await lnAccessControl.connect(deployer).__LnAccessControl_init(
      admin.address // admin
    );

    lnCollateralSystem = await LnCollateralSystem.deploy();
    await lnCollateralSystem.connect(deployer).__LnCollateralSystem_init(
      admin.address // admin
    );

    linaToken = await LINAToken.deploy(
      "Linear Finance", // _name
      "LINA" // _symbol
    );

    lnAssetSystem = await LnAssetSystem.deploy();
    await lnAssetSystem.connect(deployer).__LnAssetSystem_init(admin.address);

    await lnAssetSystem
      .connect(admin)
      .updateAll(
        [
          ethers.utils.formatBytes32String("LnAssetSystem"),
          ethers.utils.formatBytes32String("LnAccessControl"),
          ethers.utils.formatBytes32String("LnConfig"),
          ethers.utils.formatBytes32String("LnPrices"),
          ethers.utils.formatBytes32String("LnDebtSystem"),
          ethers.utils.formatBytes32String("LnBuildBurnSystem"),
          ethers.utils.formatBytes32String("LnRewardLocker"),
          ethers.utils.formatBytes32String("LnLiquidation"),
        ],
        [
          lnAssetSystem.address,
          lnAccessControl.address,
          mockLnConfigAddr,
          mockLnPricesAddr,
          mockLnDebtSystemAddr,
          mockLnBuildBurnSystemAddr,
          rewardLocker.address,
          mockLnLiquidationAddr,
        ]
      );

    await lnCollateralSystem
      .connect(admin)
      .updateAddressCache(lnAssetSystem.address);

    await lnCollateralSystem
      .connect(admin)
      .UpdateTokenInfos([linaCurrencyKey], [linaToken.address], [1], [false]);
  });

  it("only reward locker can call collateralFromUnlockReward function", async () => {
    await expect(
      lnCollateralSystem
        .connect(alice)
        .collateralFromUnlockReward(
          alice.address,
          rewarder.address,
          linaCurrencyKey,
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
        linaCurrencyKey,
        expandTo18Decimals(10)
      );

    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        linaCurrencyKey
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
        linaCurrencyKey
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
          linaCurrencyKey,
          expandTo18Decimals(10)
        )
    )
      .to.emit(lnCollateralSystem, "CollateralUnlockReward")
      .withArgs(
        alice.address,
        linaCurrencyKey,
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
        linaCurrencyKey
      )
    ).to.eq(expandTo18Decimals(10));
    let tokeninfo = await lnCollateralSystem.tokenInfos(linaCurrencyKey);
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
          linaCurrencyKey,
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
    ).to.be.revertedWith("LnCollateralSystem: Invalid token symbol");

    let linaTokeninfo = await lnCollateralSystem.tokenInfos(linaCurrencyKey);
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
        linaCurrencyKey,
        expandTo18Decimals(1)
      );

    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        linaCurrencyKey
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
          linaCurrencyKey,
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
        linaCurrencyKey,
        expandTo18Decimals(1)
      );

    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        linaCurrencyKey
      )
    ).to.eq(expandTo18Decimals(1));
  });

  it("collateralFromUnlockReward will fail if rewarder doesn't have sufficient balance", async () => {
    expect(
      await lnCollateralSystem.userCollateralData(
        alice.address,
        linaCurrencyKey
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
          linaCurrencyKey,
          expandTo18Decimals(10)
        )
    ).to.be.revertedWith("TransferHelper: transferFrom failed");
  });
});
