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
  linaTokenProxy: Contract;
  linaTokenStorage: Contract;
  lusdToken: Contract;
  lnAccessControl: Contract;
  lnAssetSystem: Contract;
  lnBuildBurnSystem: Contract;
  lnDefaultPrices: Contract;
  lnCollateralSystem: Contract;
  lnConfig: Contract;
  lnDebtSystem: Contract;
  lnFeeSystem: Contract;
  lnRewardLocker: Contract;
  lnErc20Bridge: Contract;
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
    LnFeeSystem,
    LnProxyERC20,
    LnRewardLocker,
    LnTokenStorage,
    LnErc20Bridge,
  ] = await Promise.all(
    [
      "LinearFinance",
      "LnAccessControl",
      "LnAssetSystem",
      "LnAssetUpgradeable",
      "LnCollateralSystem",
      "LnConfig",
      "LnFeeSystem",
      "LnProxyERC20",
      "LnRewardLocker",
      "LnTokenStorage",
      "LnErc20Bridge",
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
   * Deploy proxy, logic and storage contracts for LINA token and hook
   * them up.
   *
   * NOTE: these contracts follow the "call-style" proxy pattern, which
   * is no longer used in the system. However, we're keeping it this way
   * to mimic what's deployed on mainnet.
   */
  const linaTokenProxy: Contract = await LnProxyERC20.deploy(
    admin.address // _admin
  );
  const linaTokenStorage: Contract = await LnTokenStorage.deploy(
    admin.address, // _admin
    zeroAddress // _operator
  );
  const linaToken: Contract = await LinearFinance.deploy(
    linaTokenProxy.address, // _proxy
    linaTokenStorage.address, // _tokenStorage
    admin.address, // _admin
    0 // _totalSupply
  );
  await linaTokenProxy.connect(admin).setTarget(linaToken.address);
  await linaTokenStorage.connect(admin).setOperator(linaToken.address);

  /**
   * This contract serves two purposes:
   * - An asset registry for recording all synthetic assets
   * - A contract address registry for service discovery
   */
  const lnAssetSystem = await LnAssetSystem.deploy(
    admin.address // _admin
  );

  /**
   * The contract for controlling issuance and burning of synthetic assets
   */
  const lnBuildBurnSystem = await LnBuildBurnSystem.deploy(
    admin.address, // admin
    zeroAddress // _lUSDTokenAddr
  );

  /**
   * A contract for storing configuration values
   */
  const lnConfig = await LnConfig.deploy(
    admin.address // _admin
  );

  /**
   * A contract for role-based access control
   */
  const lnAccessControl = await LnAccessControl.deploy(
    admin.address // admin
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

  const lnFeeSystem = await upgrades.deployProxy(
    LnFeeSystem,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LnFeeSystem_init",
      unsafeAllowCustomTypes: true,
    }
  );

  const lnRewardLocker = await upgrades.deployProxy(
    LnRewardLocker,
    [
      admin.address, // _admin
      linaTokenProxy.address, // linaAddress
    ],
    {
      initializer: "__LnRewardLocker_init",
      unsafeAllowCustomTypes: true,
    }
  );

  const lnErc20Bridge = await upgrades.deployProxy(
    LnErc20Bridge,
    [
      linaTokenProxy.address, // _tokenAddr
      admin.address, // _admin
    ],
    {
      initializer: "__LnErc20Bridge_init",
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
   * `LnFeeSystem` and `LnRewardLocker` have a special Init function that
   * must be called by admin first.
   *
   * TODO: change to use setters or address cache instead
   */
  await lnFeeSystem.connect(admin).Init(
    mockExchangeAddress, // _exchangeSystem
    admin.address // _rewardDistri
  );
  await lnRewardLocker.connect(admin).Init(
    lnFeeSystem.address // _feeSysAddr
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
        lnFeeSystem.address,
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
  await lnFeeSystem.connect(admin).updateAddressCache(lnAssetSystem.address);

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
    linaTokenProxy.address, // _tokenAddr
    expandTo18Decimals(1), // _minCollateral
    false // _close
  );

  return {
    linaToken,
    linaTokenProxy,
    linaTokenStorage,
    lusdToken,
    lnAccessControl,
    lnAssetSystem,
    lnBuildBurnSystem,
    lnDefaultPrices,
    lnCollateralSystem,
    lnConfig,
    lnDebtSystem,
    lnFeeSystem,
    lnRewardLocker,
    lnErc20Bridge,
  };
};
