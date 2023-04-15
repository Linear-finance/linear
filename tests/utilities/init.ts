/**
 * This file is for bootstrapping a testing environment that's as complete as possible.
 * Note that this is intended for integration tests. For unit tests, you are recommended
 * to use mocks etc. to isolate the module under test.
 */

import { Duration } from "luxon";
import { ethers, upgrades } from "hardhat";
import { BigNumber, Contract } from "ethers";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/dist/src/signer-with-address";

import { expandTo18Decimals, zeroAddress } from ".";
import { formatBytes32String } from "ethers/lib/utils";

export interface DeployedStack {
  linaToken: Contract;
  lusdToken: Contract;
  lbtcToken: Contract;
  lbtcPerp: Contract;
  lnAccessControl: Contract;
  lnAssetSystem: Contract;
  lnBuildBurnSystem: Contract;
  lnPrices: Contract;
  lnCollateralSystem: Contract;
  lnConfig: Contract;
  lnDebtSystem: Contract;
  lnExchangeSystem: Contract;
  lnPerpExchange: Contract;
  lnPerpPositionToken: Contract;
  lnRewardLocker: Contract;
  lnRewardSystem: Contract;
  lnLiquidation: Contract;
}

export const deployLinearStack = async (
  deployer: SignerWithAddress,
  admin: SignerWithAddress
): Promise<DeployedStack> => {
  // Disable OpenZepplin upgrade warnings for test runs
  upgrades.silenceWarnings();

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
    LnPerpetual,
    LnPerpExchange,
    LnPerpPositionToken,
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
      "LnPerpetual",
      "LnPerpExchange",
      "LnPerpPositionToken",
      "LnRewardLocker",
      "LnRewardSystem",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );

  // Load contract factories with external libraries
  const [
    LnBuildBurnSystem,
    MockLnPrices,
    LnDebtSystem,
    LnExchangeSystem,
    LnLiquidation,
  ] = await Promise.all(
    [
      "LnBuildBurnSystem",
      "MockLnPrices",
      "LnDebtSystem",
      "LnExchangeSystem",
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
    }
  );

  /**
   * Oracle contract for price data access
   */
  const lnPrices = await MockLnPrices.deploy(
    Duration.fromObject({ hours: 12 }).as("seconds") // _stalePeriod
  );

  const lnDebtSystem = await upgrades.deployProxy(
    LnDebtSystem,
    [admin.address],
    {
      initializer: "__LnDebtSystem_init",
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
      unsafeAllowLinkedLibraries: true,
    }
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

  const lnExchangeSystem = await upgrades.deployProxy(
    LnExchangeSystem,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LnExchangeSystem_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  const lnLiquidation = await upgrades.deployProxy(
    LnLiquidation,
    [
      lnBuildBurnSystem.address, // _lnBuildBurnSystem
      lnCollateralSystem.address, // _lnCollateralSystem
      lnConfig.address, // _lnConfig
      lnDebtSystem.address, // _lnDebtSystem
      lnPrices.address, // _lnPrices
      lnRewardLocker.address, // _lnRewardLocker
      admin.address, // _admin
    ],
    {
      initializer: "__LnLiquidation_init",
      unsafeAllowLinkedLibraries: true,
    }
  );

  /**
   * Set config items:
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
      config.value // value
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
    [true] // setTo
  );

  /**
   * Assign the following role to contract `LnLiquidation`:
   * - MOVE_REWARD
   */
  await lnAccessControl.connect(admin).SetRoles(
    formatBytes32String("MOVE_REWARD"), // roleType
    [lnLiquidation.address], // addresses
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
        ethers.utils.formatBytes32String("LnDebtSystem"),
        ethers.utils.formatBytes32String("LnCollateralSystem"),
        ethers.utils.formatBytes32String("LnBuildBurnSystem"),
        ethers.utils.formatBytes32String("LnRewardLocker"),
        ethers.utils.formatBytes32String("LnExchangeSystem"),
        ethers.utils.formatBytes32String("LnLiquidation"),
      ],
      [
        lnAssetSystem.address,
        lnAccessControl.address,
        lnConfig.address,
        lnPrices.address,
        lnDebtSystem.address,
        lnCollateralSystem.address,
        lnBuildBurnSystem.address,
        lnRewardLocker.address,
        lnExchangeSystem.address,
        lnLiquidation.address,
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
    }
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
    }
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
    }
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
    }
  );

  /**
   * Register lUSD on `LnBuildBurnSystem`
   */
  await lnBuildBurnSystem.connect(admin).SetLusdTokenAddress(lusdToken.address);

  /**
   * Register synth assets and perps on `LnAssetSystem`
   */
  await lnAssetSystem.connect(admin).addAsset(lusdToken.address);
  await lnAssetSystem.connect(admin).addAsset(lbtcToken.address);
  await lnAssetSystem.connect(admin).addPerp(lbtcPerp.address);

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
   * Set CollateralSystem addrress to `LnRewardLocker`
   */
  await lnRewardLocker
    .connect(admin)
    .updateCollateralSystemAddress(lnCollateralSystem.address);

  /**
   * A contract for distributing rewards calculated and signed off-chain.
   */
  const lnRewardSystem = await upgrades.deployProxy(
    LnRewardSystem,
    [
      (await ethers.provider.getBlock("latest")).timestamp, // _firstPeriodStartTime
      [admin.address, "0xffffffffffffffffffffffffffffffffffffffff"], // _rewardSigners
      lusdToken.address, // _lusdAddress
      lnCollateralSystem.address, // _collateralSystemAddress
      lnRewardLocker.address, // _rewardLockerAddress
      admin.address, // _admin
    ],
    {
      initializer: "__LnRewardSystem_init",
    }
  );

  /**
   * Assign the following role to contract `LnRewardSystem`:
   * - LOCK_REWARD
   */
  await lnAccessControl.connect(admin).SetRoles(
    formatBytes32String("LOCK_REWARD"), // roleType
    [lnRewardSystem.address], // addresses
    [true] // setTo
  );

  /**
   * Synchronize LnExchangeAddress cache
   */
  await lnAssetSystem
    .connect(admin)
    .updateAll(
      [ethers.utils.formatBytes32String("LnRewardSystem")],
      [lnRewardSystem.address]
    );
  await lnExchangeSystem
    .connect(admin)
    .updateAddressCache(lnAssetSystem.address);

  /**
   * Set LnPerpExchange pool fee holder to LnRewardSystem
   */
  await lnPerpExchange.connect(admin).setPoolFeeHolder(lnRewardSystem.address);

  return {
    linaToken,
    lusdToken,
    lbtcToken,
    lbtcPerp,
    lnAccessControl,
    lnAssetSystem,
    lnBuildBurnSystem,
    lnPrices,
    lnCollateralSystem,
    lnConfig,
    lnDebtSystem,
    lnExchangeSystem,
    lnPerpExchange,
    lnPerpPositionToken,
    lnRewardLocker,
    lnRewardSystem,
    lnLiquidation,
  };
};
