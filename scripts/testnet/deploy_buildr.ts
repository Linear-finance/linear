import { ethers, upgrades } from "hardhat";
import { expandTo18Decimals } from "../utilities";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const SafeDecimalMath = await ethers.getContractFactory("SafeDecimalMath");
  const safeDecimalMath = await SafeDecimalMath.deploy();
  console.log("SafeDecimalMath deployed to:", safeDecimalMath.address);

  const LnAssetSystem = await ethers.getContractFactory("LnAssetSystem");
  const LnBuildBurnSystem = await ethers.getContractFactory(
    "LnBuildBurnSystem",
    {
      libraries: {
        "contracts/SafeDecimalMath.sol:SafeDecimalMath":
          safeDecimalMath.address,
      },
    }
  );
  const LnConfig = await ethers.getContractFactory("LnConfig");
  const LnAccessControl = await ethers.getContractFactory("LnAccessControl");
  const LnDefaultPrices = await ethers.getContractFactory("LnDefaultPrices", {
    libraries: {
      "contracts/SafeDecimalMath.sol:SafeDecimalMath": safeDecimalMath.address,
    },
  });
  const LnDebtSystem = await ethers.getContractFactory("LnDebtSystem", {
    libraries: {
      "contracts/SafeDecimalMath.sol:SafeDecimalMath": safeDecimalMath.address,
    },
  });
  const LnCollateralSystem = await ethers.getContractFactory(
    "LnCollateralSystem"
  );
  const LnFeeSystemTest = await ethers.getContractFactory("LnFeeSystemTest");
  const LnRewardLocker = await ethers.getContractFactory("LnRewardLocker");
  const LnAssetUpgradeable = await ethers.getContractFactory(
    "LnAssetUpgradeable"
  );

  const zeroAddress: string = "0x0000000000000000000000000000000000000000";
  const mockExchangeAddress: string =
    "0x0000000000000000000000000000000000000001";
  const linaTokenAddress: string = "0x908B56f016233E84c391eebe52Ee4d461fD8fb87";

  const lnAssetSystem = await LnAssetSystem.deploy(
    admin.address // _admin
  );
  console.log("LnAssetSystem deployed to:", lnAssetSystem.address);

  const lnBuildBurnSystem = await LnBuildBurnSystem.deploy(
    admin.address, // admin
    zeroAddress // _lUSDTokenAddr
  );
  console.log("LnBuildBurnSystem deployed to:", lnBuildBurnSystem.address);

  const lnConfig = await LnConfig.deploy(
    admin.address // _admin
  );
  console.log("LnConfig deployed to:", lnConfig.address);

  const lnAccessControl = await LnAccessControl.deploy(
    admin.address // admin
  );
  console.log("LnAccessControl deployed to:", lnAccessControl.address);

  const lnDefaultPrices = await upgrades.deployProxy(
    LnDefaultPrices,
    [
      admin.address, // _admin
      admin.address, // _oracle
      [], // _currencies
      [], // _prices
    ],
    {
      initializer: "__LnDefaultPrices_init",
      unsafeAllowCustomTypes: true,
      unsafeAllowLinkedLibraries: true,
    }
  );
  console.log("LnDefaultPrices proxy deployed to:", lnDefaultPrices.address);

  const lnDebtSystem = await upgrades.deployProxy(
    LnDebtSystem,
    [admin.address],
    {
      initializer: "__LnDebtSystem_init",
      unsafeAllowCustomTypes: true,
      unsafeAllowLinkedLibraries: true,
    }
  );
  console.log("LnDebtSystem proxy deployed to:", lnDebtSystem.address);

  const lnCollateralSystem = await upgrades.deployProxy(
    LnCollateralSystem,
    [
      admin.address, // admin
    ],
    {
      initializer: "__LnCollateralSystem_init",
      unsafeAllowCustomTypes: true,
      unsafeAllowLinkedLibraries: true,
    }
  );
  console.log(
    "LnCollateralSystem proxy deployed to:",
    lnCollateralSystem.address
  );

  const lnFeeSystemTest = await upgrades.deployProxy(
    LnFeeSystemTest,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LnFeeSystemTest_init",
      unsafeAllowCustomTypes: true,
      unsafeAllowLinkedLibraries: true,
    }
  );
  console.log("LnFeeSystemTest proxy deployed to:", lnFeeSystemTest.address);

  const lnRewardLocker = await upgrades.deployProxy(
    LnRewardLocker,
    [
      admin.address, // _admin
      linaTokenAddress, // linaAddress
    ],
    {
      initializer: "__LnRewardLocker_init",
      unsafeAllowCustomTypes: true,
      unsafeAllowLinkedLibraries: true,
    }
  );
  console.log("LnRewardLocker proxy deployed to:", lnRewardLocker.address);

  /**
   * Set BUILD_RATIO config value to 0.2 (18 decimals)
   */
  await lnConfig.connect(admin).setUint(
    ethers.utils.formatBytes32String("BuildRatio"), // key
    expandTo18Decimals(0.2) // value
  );

  /**
   * Assign the following roles to contract `LnBuildBurnSystem`:
   * - ISSUE_ASSET
   * - BURN_ASSET
   * - LnDebtSystem
   */
  await lnAccessControl
    .connect(admin)
    .SetIssueAssetRole([lnBuildBurnSystem.address], [true]);
  await lnAccessControl
    .connect(admin)
    .SetBurnAssetRole([lnBuildBurnSystem.address], [true]);
  await lnAccessControl
    .connect(admin)
    .SetDebtSystemRole([lnBuildBurnSystem.address], [true]);

  /**
   * `LnFeeSystem` and `LnRewardLocker` have a special Init function that
   * must be called by admin first.
   *
   * TODO: change to use setters or address cache instead
   */
  await lnFeeSystemTest.connect(admin).Init(
    mockExchangeAddress, // _exchangeSystem
    admin.address // _rewardDistri
  );
  await lnRewardLocker.connect(admin).Init(
    lnFeeSystemTest.address // _feeSysAddr
  );

  /**
   * Fill the contract address registry
   */
  await lnAssetSystem
    .connect(admin)
    .updateAll(
      [
        ethers.utils.formatBytes32String("LnAssetSystem"),
        ethers.utils.formatBytes32String("LnAccessControl"),
        ethers.utils.formatBytes32String("LnConfig"),
        ethers.utils.formatBytes32String("LnPrices"),
        ethers.utils.formatBytes32String("LnDebtSystem"),
        ethers.utils.formatBytes32String("LnCollateralSystem"),
        ethers.utils.formatBytes32String("LnBuildBurnSystem"),
        ethers.utils.formatBytes32String("LnFeeSystem"),
        ethers.utils.formatBytes32String("LnRewardLocker"),
        ethers.utils.formatBytes32String("LnExchangeSystem"),
      ],
      [
        lnAssetSystem.address,
        lnAccessControl.address,
        lnConfig.address,
        lnDefaultPrices.address,
        lnDebtSystem.address,
        lnCollateralSystem.address,
        lnBuildBurnSystem.address,
        lnFeeSystemTest.address,
        lnRewardLocker.address,
        mockExchangeAddress,
      ]
    );

  /**
   * Synchronize contract address cache
   */
  await lnBuildBurnSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);
  await lnCollateralSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);
  await lnDebtSystem.connect(admin).updateAddressCache(lnAssetSystem.address);
  await lnFeeSystemTest
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);

  const lusdToken = await upgrades.deployProxy(
    LnAssetUpgradeable,
    [
      ethers.utils.formatBytes32String("lUSD"), // bytes32 _key,
      "lUSD", // _name,
      "lUSD", // _symbol
      admin.address, // _admin
    ],
    {
      initializer: "__LnAssetUpgradeable_init",
    }
  );
  console.log("lUSD token proxy deployed to:", lusdToken.address);

  /**
   * Update lUSD address cache
   */
  await lusdToken.connect(admin).updateAddressCache(lnAssetSystem.address);

  /**
   * Register lUSD on `LnAssetSystem` and `kLnBuildBurnSystem`
   */
  await lnAssetSystem.connect(admin).addAsset(lusdToken.address);
  await lnBuildBurnSystem.connect(admin).SetLusdTokenAddress(lusdToken.address);

  /**
   * Register LINA on `LnCollateralSystem`
   */
  await lnCollateralSystem.connect(admin).UpdateTokenInfo(
    ethers.utils.formatBytes32String("LINA"), // _currency
    linaTokenAddress, // _tokenAddr
    expandTo18Decimals(1), // _minCollateral
    false // _close
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
