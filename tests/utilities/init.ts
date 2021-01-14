/**
 * This file is for bootstrapping a testing environment that's as complete as possible.
 * Note that this is intended for integration tests. For unit tests, you are recommended
 * to use mocks etc. to isolate the module under test.
 */

import { ethers, upgrades } from "hardhat";
import { Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expandTo18Decimals, zeroAddress } from ".";

export interface DeployedStack {
  linaToken: Contract;
  lusdToken: Contract;
  lnAccessControl: Contract;
  lnAssetSystem: Contract;
  lnBuildBurnSystem: Contract;
  lnDefaultPrices: Contract;
  lnCollateralSystem: Contract;
  lnConfig: Contract;
  lnDebtSystem: Contract;
  lnRewardLocker: Contract;
  lnRewardSystem: Contract;
}

export const deployLinearStack = async (
  deployer: SignerWithAddress,
  admin: SignerWithAddress
): Promise<DeployedStack> => {
  // Disable OpenZepplin upgrade warnings for test runs
  upgrades.silenceWarnings();

  /**
   * For Buildr launch we're not deploying `LnExchangeSystem`. However, `LnFeeSystem`
   * requires the exchange contract's address to be non-zero to function, so we're
   * putting a mock address here instead.
   */
  const mockExchangeAddress: string =
    "0x0000000000000000000000000000000000000001";

  /**
   * Reusable SafeDecimalMath library. Contracts that depend on it must link
   * to it first before being deployed.
   */
  const SafeDecimalMath = await ethers.getContractFactory(
    "SafeDecimalMath",
    deployer
  );
  const safeDecimalMath = await SafeDecimalMath.deploy();

  // Load contract factories without external libraries
  const [
    LinearFinance,
    LnAccessControl,
    LnAssetSystem,
    LnAssetUpgradeable,
    LnCollateralSystem,
    LnConfig,
    LnRewardLocker,
    LnRewardSystem,
  ] = await Promise.all(
    [
      "LinearFinance",
      "LnAccessControl",
      "LnAssetSystem",
      "LnAssetUpgradeable",
      "LnCollateralSystem",
      "LnConfig",
      "LnRewardLocker",
      "LnRewardSystem",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );

  // Load contract factories with external libraries
  const [LnBuildBurnSystem, LnDefaultPrices, LnDebtSystem] = await Promise.all(
    ["LnBuildBurnSystem", "LnDefaultPrices", "LnDebtSystem"].map(
      (contractName) =>
        ethers.getContractFactory(contractName, {
          signer: deployer,
          libraries: {
            "contracts/SafeDecimalMath.sol:SafeDecimalMath":
              safeDecimalMath.address,
          },
        })
    )
  );

  /**
   * LINA token contract
   */
  const linaToken: Contract = await upgrades.deployProxy(
    LinearFinance,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LinearFinance_init",
    }
  );

  /**
   * This contract serves two purposes:
   * - An asset registry for recording all synthetic assets
   * - A contract address registry for service discovery
   */
  const lnAssetSystem = await upgrades.deployProxy(
    LnAssetSystem,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LnAssetSystem_init",
    }
  );

  /**
   * The contract for controlling issuance and burning of synthetic assets
   */
  const lnBuildBurnSystem = await upgrades.deployProxy(
    LnBuildBurnSystem,
    [
      admin.address, // admin
      zeroAddress, // _lUSDTokenAddr
    ],
    {
      initializer: "__LnBuildBurnSystem_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  /**
   * A contract for storing configuration values
   */
  const lnConfig = await upgrades.deployProxy(
    LnConfig,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LnConfig_init",
    }
  );

  /**
   * A contract for role-based access control
   */
  const lnAccessControl = await upgrades.deployProxy(
    LnAccessControl,
    [
      admin.address, // admin
    ],
    {
      initializer: "__LnAccessControl_init",
      unsafeAllowCustomTypes: true,
    }
  );

  /**
   * Oracle contract for price data access
   */
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

  const lnDebtSystem = await upgrades.deployProxy(
    LnDebtSystem,
    [admin.address],
    {
      initializer: "__LnDebtSystem_init",
      unsafeAllowCustomTypes: true,
      unsafeAllowLinkedLibraries: true,
    }
  );

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

  const lnRewardLocker = await upgrades.deployProxy(
    LnRewardLocker,
    [
      admin.address, // _admin
      linaToken.address, // linaAddress
    ],
    {
      initializer: "__LnRewardLocker_init",
      unsafeAllowCustomTypes: true,
    }
  );

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

  /**
   * Create the base synthetic asset lUSD
   */
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
    linaToken.address, // _tokenAddr
    expandTo18Decimals(1), // _minCollateral
    false // _close
  );

  /**
   * A contract for distributing rewards calculated and signed off-chain.
   */
  const lnRewardSystem = await upgrades.deployProxy(
    LnRewardSystem,
    [
      (await ethers.provider.getBlock("latest")).timestamp, // _firstPeriodStartTime
      admin.address, // _rewardSigner
      lusdToken.address, // _lusdAddress
      lnCollateralSystem.address, // _collateralSystemAddress
      lnRewardLocker.address, // _rewardLockerAddress
      admin.address, // _admin
    ],
    {
      initializer: "__LnRewardSystem_init",
      unsafeAllowCustomTypes: true,
    }
  );

  /**
   * `LnRewardLocker` has a special Init function that must be called by admin first.
   *
   * TODO: change to use setters or address cache instead
   */
  await lnRewardLocker.connect(admin).Init(
    lnRewardSystem.address // _feeSysAddr
  );

  return {
    linaToken,
    lusdToken,
    lnAccessControl,
    lnAssetSystem,
    lnBuildBurnSystem,
    lnDefaultPrices,
    lnCollateralSystem,
    lnConfig,
    lnDebtSystem,
    lnRewardLocker,
    lnRewardSystem,
  };
};
