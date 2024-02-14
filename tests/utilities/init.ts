/**
 * This file is for bootstrapping a testing environment that's as complete as possible.
 * Note that this is intended for integration tests. For unit tests, you are recommended
 * to use mocks etc. to isolate the module under test.
 */

import { Duration } from "luxon";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import {
  expandTo18Decimals,
  expandTo8Decimals,
  zeroAddress,
  mockAddress,
} from ".";
import { formatBytes32String } from "ethers/lib/utils";

export interface DeployedStack {
  collaterals: MultiColalteralContracts;
  lusdToken: Contract;
  lbtcToken: Contract;
  lbtcPerp: Contract;
  lnAccessControl: Contract;
  lnAssetSystem: Contract;
  lnPrices: Contract;
  lnConfig: Contract;
  debtDistribution: Contract;
  lnExchangeSystem: Contract;
  lnPerpExchange: Contract;
  lnPerpPositionToken: Contract;
  lnRewardLocker: Contract;
  lnRewardSystem: Contract;
}

export interface MultiColalteralContracts {
  lina: CollateralContracts;
  wbtc: CollateralContracts;
}

export interface CollateralContracts {
  symbol: String;
  token: Contract;
  debtSystem: Contract;
  buildBurnSystem: Contract;
  collateralSystem: Contract;
  liquidation: Contract;
}

export const deployLinearStack = async (
  deployer: SignerWithAddress,
  admin: SignerWithAddress,
): Promise<DeployedStack> => {
  // Disable OpenZepplin upgrade warnings for test runs
  upgrades.silenceWarnings();

  /**
   * Reusable SafeDecimalMath library. Contracts that depend on it must link
   * to it first before being deployed.
   */
  const SafeDecimalMath = await ethers.getContractFactory(
    "SafeDecimalMath",
    deployer,
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
    LnPerpetual,
    LnPerpExchange,
    LnPerpPositionToken,
    LnRewardLocker,
    LnRewardSystem,
    MockERC20,
  ] = await Promise.all(
    [
      "LinearFinance",
      "LnAccessControl",
      "LnAssetSystem",
      "LnAssetUpgradeable",
      "LnCollateralSystem",
      "LnConfig",
      "LnPerpetual",
      "LnPerpExchange",
      "LnPerpPositionToken",
      "LnRewardLocker",
      "LnRewardSystem",
      "MockERC20",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer)),
  );

  // Removed safe decimal math from libraries
  const [LnExchangeSystem] = await Promise.all(
    ["LnExchangeSystem"].map((contractName) =>
      ethers.getContractFactory(contractName, deployer),
    ),
  );

  // Load contract factories with external libraries
  const [
    LnBuildBurnSystem,
    MockLnPrices,
    LnDebtSystem,
    DebtDistribution,
    LnLiquidation,
  ] = await Promise.all(
    [
      "LnBuildBurnSystem",
      "MockLnPrices",
      "LnDebtSystem",
      "DebtDistribution",
      "LnLiquidation",
    ].map((contractName) =>
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
    },
  );

  const wbtcToken = await MockERC20.deploy(
    "Wrapped BTC", // _name
    "WBTC", // _symbol
    8 // _decimals
  );

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
    },
  );

  const wbtcToken = await MockERC20.deploy(
    "Wrapped BTC", // _name
    "WBTC", // _symbol
    8 // _decimals
  );

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
    },
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
    },
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
    },
  );

  /**
   * Oracle contract for price data access
   */
  const lnPrices = await MockLnPrices.deploy(
    Duration.fromObject({ hours: 12 }).as("seconds") // _stalePeriod
  );

  const lnRewardLocker = await upgrades.deployProxy(
    LnRewardLocker,
    [
      linaToken.address, // _linaTokenAddr
      lnAccessControl.address, // _accessCtrl
      admin.address, // _admin
    ],
    {
      initializer: "__LnRewardLocker_init",
    }
  );

  const debtDistribution = await upgrades.deployProxy(
    DebtDistribution,
    [lnAssetSystem.address],
    {
      initializer: "__DebtDistribution_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const linaDebtSystem = await upgrades.deployProxy(
    LnDebtSystem,
    [admin.address, lnAccessControl.address, lnAssetSystem.address],
    {
      initializer: "__LnDebtSystem_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const wbtcDebtSystem = await upgrades.deployProxy(
    LnDebtSystem,
    [admin.address, lnAccessControl.address, lnAssetSystem.address],
    {
      initializer: "__LnDebtSystem_init",
      unsafeAllowLinkedLibraries: true,
    },
  );

  /**
   * The contract for controlling issuance and burning of synthetic assets
   */
  const linaBuildBurnSystem = await upgrades.deployProxy(
    LnBuildBurnSystem,
    [
      admin.address, // admin
      lusdToken.address, // _lUSDToken
      linaDebtSystem.address, // _debtSystem
      lnPrices.address, // _priceGetter
      mockAddress, // _collaterSys
      lnConfig.address, // _mConfig
      mockAddress, // _liquidation
    ],
    {
      initializer: "__LnBuildBurnSystem_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const wbtcBuildBurnSystem = await upgrades.deployProxy(
    LnBuildBurnSystem,
    [
      admin.address, // admin
      lusdToken.address, // _lUSDToken
      wbtcDebtSystem.address, // _debtSystem
      lnPrices.address, // _priceGetter
      mockAddress, // _collaterSys
      lnConfig.address, // _mConfig
      mockAddress, // _liquidation
    ],
    {
      initializer: "__LnBuildBurnSystem_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const linaCollateralSystem = await upgrades.deployProxy(
    LnCollateralSystem,
    [
      admin.address, // admin
      lnPrices.address, // _priceGetter
      linaDebtSystem.address, // _debtSystem
      lnConfig.address, // _mConfig
      lnRewardLocker.address, // _mRewardLocker
      linaBuildBurnSystem.address, // _buildBurnSystem
      mockAddress, // _liquidation
    ],
    {
      initializer: "__LnCollateralSystem_init",
      unsafeAllowLinkedLibraries: true,
    },
  );

  // Not setting _mRewardLocker as it's only relevant for the native currency
  const wbtcCollateralSystem = await upgrades.deployProxy(
    LnCollateralSystem,
    [
      admin.address, // admin
      lnPrices.address, // _priceGetter
      wbtcDebtSystem.address, // _debtSystem
      lnConfig.address, // _mConfig
      mockAddress, // _mRewardLocker
      wbtcBuildBurnSystem.address, // _buildBurnSystem
      mockAddress, // _liquidation
    ],
    {
      initializer: "__LnCollateralSystem_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const debtDistribution = await upgrades.deployProxy(
    DebtDistribution,
    [lnAssetSystem.address],
    {
      initializer: "__DebtDistribution_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const linaDebtSystem = await upgrades.deployProxy(
    LnDebtSystem,
    [admin.address, lnAccessControl.address, lnAssetSystem.address],
    {
      initializer: "__LnDebtSystem_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const wbtcDebtSystem = await upgrades.deployProxy(
    LnDebtSystem,
    [admin.address, lnAccessControl.address, lnAssetSystem.address],
    {
      initializer: "__LnDebtSystem_init",
      unsafeAllowLinkedLibraries: true,
    },
  );

  /**
   * The contract for controlling issuance and burning of synthetic assets
   */
  const linaBuildBurnSystem = await upgrades.deployProxy(
    LnBuildBurnSystem,
    [
      admin.address, // admin
      lusdToken.address, // _lUSDToken
      linaDebtSystem.address, // _debtSystem
      lnPrices.address, // _priceGetter
      mockAddress, // _collaterSys
      lnConfig.address, // _mConfig
      mockAddress, // _liquidation
    ],
    {
      initializer: "__LnBuildBurnSystem_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const wbtcBuildBurnSystem = await upgrades.deployProxy(
    LnBuildBurnSystem,
    [
      admin.address, // admin
      lusdToken.address, // _lUSDToken
      wbtcDebtSystem.address, // _debtSystem
      lnPrices.address, // _priceGetter
      mockAddress, // _collaterSys
      lnConfig.address, // _mConfig
      mockAddress, // _liquidation
    ],
    {
      initializer: "__LnBuildBurnSystem_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const linaCollateralSystem = await upgrades.deployProxy(
    LnCollateralSystem,
    [
      admin.address, // admin
      lnPrices.address, // _priceGetter
      linaDebtSystem.address, // _debtSystem
      lnConfig.address, // _mConfig
      lnRewardLocker.address, // _mRewardLocker
      linaBuildBurnSystem.address, // _buildBurnSystem
      mockAddress, // _liquidation
    ],
    {
      initializer: "__LnCollateralSystem_init",
      unsafeAllowLinkedLibraries: true,
    },
  );

  // Not setting _mRewardLocker as it's only relevant for the native currency
  const wbtcCollateralSystem = await upgrades.deployProxy(
    LnCollateralSystem,
    [
      admin.address, // admin
      lnPrices.address, // _priceGetter
      wbtcDebtSystem.address, // _debtSystem
      lnConfig.address, // _mConfig
      mockAddress, // _mRewardLocker
      wbtcBuildBurnSystem.address, // _buildBurnSystem
      mockAddress, // _liquidation
    ],
    {
      initializer: "__LnRewardLocker_init",
    }
  );

  const lnExchangeSystem = await upgrades.deployProxy(
    LnExchangeSystem,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LnExchangeSystem_init",
      unsafeAllowLinkedLibraries: true,
    },
  );

  const linaLiquidation = await upgrades.deployProxy(
    LnLiquidation,
    [
      linaBuildBurnSystem.address, // _lnBuildBurnSystem
      linaCollateralSystem.address, // _lnCollateralSystem
      lnConfig.address, // _lnConfig
      linaDebtSystem.address, // _lnDebtSystem
      lnPrices.address, // _lnPrices
      lnRewardLocker.address, // _lnRewardLocker
      admin.address, // _admin
    ],
    {
      initializer: "__LnLiquidation_init",
      unsafeAllowLinkedLibraries: true,
    },
  );

  // Not setting _lnRewardLocker as it's only relevant for the native currency
  const wbtcLiquidation = await upgrades.deployProxy(
    LnLiquidation,
    [
      wbtcBuildBurnSystem.address, // _lnBuildBurnSystem
      wbtcCollateralSystem.address, // _lnCollateralSystem
      lnConfig.address, // _lnConfig
      wbtcDebtSystem.address, // _lnDebtSystem
      lnPrices.address, // _lnPrices
      mockAddress, // _lnRewardLocker
      admin.address, // _admin
    ],
    {
      initializer: "__LnLiquidation_init",
      unsafeAllowLinkedLibraries: true,
    },
  );

  // Not setting _lnRewardLocker as it's only relevant for the native currency
  const wbtcLiquidation = await upgrades.deployProxy(
    LnLiquidation,
    [
      wbtcBuildBurnSystem.address, // _lnBuildBurnSystem
      wbtcCollateralSystem.address, // _lnCollateralSystem
      lnConfig.address, // _lnConfig
      wbtcDebtSystem.address, // _lnDebtSystem
      lnPrices.address, // _lnPrices
      mockAddress, // _lnRewardLocker
      admin.address, // _admin
    ],
    {
      initializer: "__LnLiquidation_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  /**
   * Set config items for LINA collateral:
   *
   * - BuildRatio: 0.2
   * - LiquidationRatio: 0.5
   * - LiquidationMarkerReward: 0.05
   * - LiquidationLiquidatorReward: 0.1
   * - LiquidationDelay: 3 days
   */
  for (const config of [
    {
      key: "BuildRatio",
      value: expandTo18Decimals(0.2),
    },
    {
      key: "LiquidationMarkRemoveRatio",
      value: BigNumber.from("222222222222222222"),
    },
    {
      key: "LiquidationRatio",
      value: expandTo18Decimals(0.5),
    },
    {
      key: "LiquidationMarkerReward",
      value: expandTo18Decimals(0.05),
    },
    {
      key: "LiquidationLiquidatorReward",
      value: expandTo18Decimals(0.1),
    },
    {
      key: "LiquidationDelay",
      value: Duration.fromObject({ days: 3 }).as("seconds"),
    },
  ])
    await lnConfig.connect(admin).setUint(
      ethers.utils.formatBytes32String(config.key), // key
      config.value, // value
    );

  /**
   * Set config items for WBTC collateral:
   *
   * - BuildRatio: 0.5
   * - LiquidationRatio: 0.5
   * - LiquidationMarkerReward: 0.02
   * - LiquidationLiquidatorReward: 0.05
   * - LiquidationDelay: 1 day
   */
  for (const item of [
    {
      key: "WBTC_BuildRatio",
      value: expandTo18Decimals(0.5),
    },
    {
      key: "WBTC_LiqRatio",
      value: expandTo18Decimals(0.5),
    },
    {
      key: "WBTC_LiqMarkerReward",
      value: expandTo18Decimals(0.02),
    },
    {
      key: "WBTC_LiqLiquidatorReward",
      value: expandTo18Decimals(0.05),
    },
    {
      key: "WBTC_LiqDelay",
      value: Duration.fromObject({ days: 1 }).as("seconds"),
    },
  ])
    await lnConfig.connect(admin).setUint(
      ethers.utils.formatBytes32String(item.key), // key
      item.value // value
    );

  /**
   * Set config items for WBTC collateral:
   *
   * - BuildRatio: 0.5
   * - LiquidationRatio: 0.5
   * - LiquidationMarkerReward: 0.02
   * - LiquidationLiquidatorReward: 0.05
   * - LiquidationDelay: 1 day
   */
  for (const item of [
    {
      key: "WBTC_BuildRatio",
      value: expandTo18Decimals(0.5),
    },
    {
      key: "WBTC_LiqRatio",
      value: expandTo18Decimals(0.5),
    },
    {
      key: "WBTC_LiqMarkerReward",
      value: expandTo18Decimals(0.02),
    },
    {
      key: "WBTC_LiqLiquidatorReward",
      value: expandTo18Decimals(0.05),
    },
    {
      key: "WBTC_LiqDelay",
      value: Duration.fromObject({ days: 1 }).as("seconds"),
    },
  ])
    await lnConfig.connect(admin).setUint(
      ethers.utils.formatBytes32String(item.key), // key
      item.value // value
    );

  /**
   * Assign the following roles to contract `LnBuildBurnSystem`:
   * - ISSUE_ASSET
   * - BURN_ASSET
   * - LnDebtSystem
   */
  await lnAccessControl
    .connect(admin)
    .SetIssueAssetRole(
      [linaBuildBurnSystem.address, wbtcBuildBurnSystem.address],
      [true, true]
    );
  await lnAccessControl
    .connect(admin)
    .SetBurnAssetRole(
      [linaBuildBurnSystem.address, wbtcBuildBurnSystem.address],
      [true, true]
    );
  await lnAccessControl
    .connect(admin)
    .SetDebtSystemRole(
      [linaBuildBurnSystem.address, wbtcBuildBurnSystem.address],
      [true, true]
    );

  /**
   * Assign the following roles to contract `LnExchangeSystem`:
   * - ISSUE_ASSET
   * - BURN_ASSET
   * - MOVE_ASSET
   */
  await lnAccessControl
    .connect(admin)
    .SetIssueAssetRole([lnExchangeSystem.address], [true]);
  await lnAccessControl
    .connect(admin)
    .SetBurnAssetRole([lnExchangeSystem.address], [true]);
  await lnAccessControl.connect(admin).SetRoles(
    formatBytes32String("MOVE_ASSET"), // roleType
    [lnExchangeSystem.address], // addresses
    [true], // setTo
  );

  /**
   * Assign the following role to contract `LnLiquidation`:
   * - MOVE_REWARD
   *
   * Only the native collateral needs this permission.
   */
  await lnAccessControl.connect(admin).SetRoles(
    formatBytes32String("MOVE_REWARD"), // roleType
    [linaLiquidation.address], // addresses
    [true] // setTo
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
        ethers.utils.formatBytes32String("LnRewardLocker"),
        ethers.utils.formatBytes32String("LnExchangeSystem"),
      ],
      [
        lnAssetSystem.address,
        lnAccessControl.address,
        lnConfig.address,
        lnPrices.address,
        lnRewardLocker.address,
        lnExchangeSystem.address,
        lnLiquidation.address,
      ],
    );

  /**
   * Fix circular dependencies
   */
  await linaBuildBurnSystem
    .connect(admin)
    .setCollateralSystemAddress(linaCollateralSystem.address);
  await linaBuildBurnSystem
    .connect(admin)
    .setLiquidationAddress(linaLiquidation.address);
  await linaCollateralSystem
    .connect(admin)
    .setLiquidationAddress(linaLiquidation.address);
  await wbtcBuildBurnSystem
    .connect(admin)
    .setCollateralSystemAddress(wbtcCollateralSystem.address);
  await wbtcBuildBurnSystem
    .connect(admin)
    .setLiquidationAddress(wbtcLiquidation.address);
  await wbtcCollateralSystem
    .connect(admin)
    .setLiquidationAddress(wbtcLiquidation.address);
  await lnRewardLocker
    .connect(admin)
    .updateCollateralSystemAddress(linaCollateralSystem.address);

  // Deployer owns 1M WBTC
  await wbtcToken
    .connect(admin)
    .mint(admin.address, expandTo8Decimals(1_000_000));
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
    },
  );

  /**
   * Create synthetic asset lBTC
   */
  const lbtcToken = await upgrades.deployProxy(
    LnAssetUpgradeable,
    [
      ethers.utils.formatBytes32String("lBTC"), // bytes32 _key,
      "lBTC", // _name,
      "lBTC", // _symbol
      admin.address, // _admin
    ],
    {
      initializer: "__LnAssetUpgradeable_init",
    },
  );

  /**
   * Update synth address cache
   */
  await lusdToken.connect(admin).updateAddressCache(lnAssetSystem.address);
  await lbtcToken.connect(admin).updateAddressCache(lnAssetSystem.address);

  /**
   * Deploy perp position NFT
   */
  const lnPerpPositionToken = await upgrades.deployProxy(
    LnPerpPositionToken,
    [],
    {
      initializer: "__LnPerpPositionToken_init",
    },
  );

  /**
   * Create perpetual exchange
   */
  const lnPerpExchange = await upgrades.deployProxy(
    LnPerpExchange,
    [
      lnAssetSystem.address, // _lnAssetSystem
      lnConfig.address, // _lnConfig
      lnPerpPositionToken.address, // _positionToken
      lusdToken.address, // _lusdToken
      zeroAddress, // _insuranceFundHolder
    ],
    {
      initializer: "__LnPerpExchange_init",
    },
  );

  /**
   * Grant perpetual exchange minting/burning access
   */
  await lnAccessControl
    .connect(admin)
    .SetIssueAssetRole([lnPerpExchange.address], [true]);
  await lnAccessControl
    .connect(admin)
    .SetBurnAssetRole([lnPerpExchange.address], [true]);
  await lnPerpPositionToken.connect(admin).setMinter(lnPerpExchange.address);
  await lnPerpPositionToken.connect(admin).setBurner(lnPerpExchange.address);

  /**
   * Create perpetual lBTC
   */
  const lbtcPerp = await upgrades.deployProxy(
    LnPerpetual,
    [
      lnPerpExchange.address, // _exchange
      lnPerpPositionToken.address, // _positionToken
      lusdToken.address, // _lusdToken
      lbtcToken.address, // _underlyingToken
      lnPrices.address, // _lnPrices
      expandTo18Decimals(0.1), // _minInitMargin
      expandTo18Decimals(0.05), // _maintenanceMargin
      expandTo18Decimals(0.01), // _feeRate
      expandTo18Decimals(0.02), // _liquidatorRewardRatio
      expandTo18Decimals(0.4), // _insuranceFundContributionRatio
    ],
    {
      initializer: "__LnPerpetual_init",
    },
  );

  /**
   * Register synth assets and perps on `LnAssetSystem`
   */
  await lnAssetSystem.connect(admin).addAsset(lusdToken.address);
  await lnAssetSystem.connect(admin).addAsset(lbtcToken.address);
  await lnAssetSystem.connect(admin).addPerp(lbtcPerp.address);

  /**
   * Register LINA on `LnCollateralSystem`
   */
  await linaCollateralSystem.connect(admin).updateTokenInfo(
    ethers.utils.formatBytes32String("LINA"), // _currency
    linaToken.address, // _tokenAddr
    expandTo18Decimals(1), // _minCollateral
    false // _disabled
  );
  await wbtcCollateralSystem.connect(admin).updateTokenInfo(
    formatBytes32String("WBTC"), // _currency
    wbtcToken.address, // _tokenAddr
    0_00010000, // _minCollateral
    false // _disabled
  );

  // Link `LnDebtSystem` instances to `DebtDistribution`
  await debtDistribution
    .connect(admin)
    .addCollateral(linaDebtSystem.address, formatBytes32String("LINA"));
  await linaDebtSystem
    .connect(admin)
    .setDebtDistribution(debtDistribution.address);
  await debtDistribution
    .connect(admin)
    .addCollateral(wbtcDebtSystem.address, formatBytes32String("WBTC"));
  await wbtcDebtSystem
    .connect(admin)
    .setDebtDistribution(debtDistribution.address);

  /**
   * A contract for distributing rewards calculated and signed off-chain.
   */
  const lnRewardSystem = await upgrades.deployProxy(
    LnRewardSystem,
    [
      (await ethers.provider.getBlock("latest")).timestamp, // _firstPeriodStartTime
      [admin.address, "0xffffffffffffffffffffffffffffffffffffffff"], // _rewardSigners
      lusdToken.address, // _lusdAddress
      linaCollateralSystem.address, // _collateralSystemAddress
      lnRewardLocker.address, // _rewardLockerAddress
      admin.address, // _admin
      604800,
      2,
      31449600,
    ],
    {
      initializer: "__LnRewardSystem_init",
    },
  );

  /**
   * Assign the following role to contract `LnRewardSystem`:
   * - LOCK_REWARD
   */
  await lnAccessControl.connect(admin).SetRoles(
    formatBytes32String("LOCK_REWARD"), // roleType
    [lnRewardSystem.address], // addresses
    [true], // setTo
  );

  /**
   * Synchronize LnExchangeAddress cache
   */
  await lnAssetSystem
    .connect(admin)
    .updateAll(
      [ethers.utils.formatBytes32String("LnRewardSystem")],
      [lnRewardSystem.address],
    );
  await lnExchangeSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);

  /**
   * Set LnPerpExchange pool fee holder to LnRewardSystem
   */
  await lnPerpExchange.connect(admin).setPoolFeeHolder(lnRewardSystem.address);

  return {
    collaterals: {
      lina: {
        symbol: "LINA",
        token: linaToken,
        debtSystem: linaDebtSystem,
        buildBurnSystem: linaBuildBurnSystem,
        collateralSystem: linaCollateralSystem,
        liquidation: linaLiquidation,
      },
      wbtc: {
        symbol: "WBTC",
        token: wbtcToken,
        debtSystem: wbtcDebtSystem,
        buildBurnSystem: wbtcBuildBurnSystem,
        collateralSystem: wbtcCollateralSystem,
        liquidation: wbtcLiquidation,
      },
    },
    lusdToken,
    lbtcToken,
    lbtcPerp,
    lnAccessControl,
    lnAssetSystem,
    lnPrices,
    debtDistribution,
    lnConfig,
    lnExchangeSystem,
    lnPerpExchange,
    lnPerpPositionToken,
    lnRewardLocker,
    lnRewardSystem,
  };
};
