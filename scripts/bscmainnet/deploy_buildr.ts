import { DateTime } from "luxon";
import { ethers, upgrades } from "hardhat";
import { formatBytes32String } from "ethers/lib/utils";
import { expandTo18Decimals } from "../utilities";

const TOKEN_LOCK_TYPE_TRANSFER: number = 1;

const ETH_MAINNET_CHAIN_ID = 1;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const SafeDecimalMath = await ethers.getContractFactory("SafeDecimalMath");
  const safeDecimalMath = await SafeDecimalMath.deploy();
  console.log("SafeDecimalMath deployed to:", safeDecimalMath.address);

  // Load contract factories without external libraries
  const [
    LinearFinance,
    LnAccessControl,
    LnAssetSystem,
    LnAssetUpgradeable,
    LnCollateralSystem,
    LnConfig,
    LnErc20Bridge,
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
      "LnErc20Bridge",
      "LnRewardLocker",
      "LnRewardSystem",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );

  // Load contract factories with external libraries
  const [LnBandProtocol, LnBuildBurnSystem, LnDebtSystem] = await Promise.all(
    ["LnBandProtocol", "LnBuildBurnSystem", "LnDebtSystem"].map(
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

  const firstRewardPeriodStartTime: DateTime = DateTime.fromISO(
    "2020-12-30T00:00:00Z"
  );

  const zeroAddress: string = "0x0000000000000000000000000000000000000000";
  const rewardSigner: string = "0x82356456F23850b7E63A6729Fe4b2e5572a6Fd10";
  const bridgeRelayerAddress: string =
    "0xD7c8F3Fe3A2251f79E0bd82cC1650AA7e83Ff46a";
  const bandOracleAddress: string =
    "0xDA7a001b254CD22e46d3eAB04d937489c93174C3";
  const mockExchangeAddress: string =
    "0x0000000000000000000000000000000000000001";

  /**
   * LINA token contract
   */
  const linaToken = await upgrades.deployProxy(
    LinearFinance,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LinearFinance_init",
    }
  );
  console.log("LINA token deployed to:", linaToken.address);

  const lnAssetSystem = await upgrades.deployProxy(
    LnAssetSystem,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LnAssetSystem_init",
    }
  );
  console.log("LnAssetSystem deployed to:", lnAssetSystem.address);

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
  console.log("LnBuildBurnSystem deployed to:", lnBuildBurnSystem.address);

  const lnConfig = await upgrades.deployProxy(
    LnConfig,
    [
      admin.address, // _admin
    ],
    {
      initializer: "__LnConfig_init",
    }
  );
  console.log("LnConfig deployed to:", lnConfig.address);

  const lnAccessControl = await upgrades.deployProxy(
    LnAccessControl,
    [
      admin.address, // admin
    ],
    {
      initializer: "__LnAccessControl_init",
    }
  );
  console.log("LnAccessControl deployed to:", lnAccessControl.address);

  const lnBandProtocol = await upgrades.deployProxy(
    LnBandProtocol,
    [
      admin.address, // _admin
      admin.address, // _oracle
      [], // _currencies
      [], // _prices
    ],
    {
      initializer: "__LnBandProtocol_init",
      unsafeAllowLinkedLibraries: true,
    }
  );
  console.log("LnBandProtocol proxy deployed to:", lnBandProtocol.address);

  const lnDebtSystem = await upgrades.deployProxy(
    LnDebtSystem,
    [admin.address],
    {
      initializer: "__LnDebtSystem_init",
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
      unsafeAllowLinkedLibraries: true,
    }
  );
  console.log(
    "LnCollateralSystem proxy deployed to:",
    lnCollateralSystem.address
  );

  const lnRewardLocker = await upgrades.deployProxy(
    LnRewardLocker,
    [
      admin.address, // _admin
      linaToken.address, // linaAddress
    ],
    {
      initializer: "__LnRewardLocker_init",
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
        lnBandProtocol.address,
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
      firstRewardPeriodStartTime.toSeconds(), // _firstPeriodStartTime,
      rewardSigner, // _rewardSigner,
      lusdToken.address, // _lusdAddress
      lnCollateralSystem.address, // _collateralSystemAddress
      lnRewardLocker.address, // _rewardLockerAddress
      admin.address, // _admin
    ],
    {
      initializer: "__LnRewardSystem_init",
    }
  );
  console.log("LnRewardSystem proxy deployed to:", lnRewardSystem.address);

  /**
   * `LnRewardLocker` has a special Init function that must be called by admin first.
   *
   * TODO: change to use setters or address cache instead
   */
  await lnRewardLocker.connect(admin).Init(
    lnRewardSystem.address // _feeSysAddr
  );

  /**
   * Set up band oracle
   */
  await lnBandProtocol.connect(admin).addOracle(
    formatBytes32String("LINA"), // currencyKey
    "LINA", // bandCurrencyKey
    bandOracleAddress // oracleAddress
  );
  await lnBandProtocol.connect(admin).addOracle(
    formatBytes32String("lUSD"), // currencyKey
    "USD", // bandCurrencyKey
    bandOracleAddress // oracleAddress
  );

  /**
   * Deploy ERC20 bridge contract
   */
  const lnErc20Bridge = await upgrades.deployProxy(
    LnErc20Bridge,
    [
      bridgeRelayerAddress, // _relayer
      admin.address, // _admin
    ],
    {
      initializer: "__LnErc20Bridge_init",
    }
  );
  console.log("LnErc20Bridge proxy deployed to:", lnErc20Bridge.address);

  /**
   * Mint total supply of LINA to bridge
   */
  await linaToken
    .connect(admin)
    .mint(lnErc20Bridge.address, expandTo18Decimals(10_000_000_000));

  /**
   * Configure token bridge
   */
  await lnErc20Bridge.connect(admin).addToken(
    formatBytes32String("LINA"), // tokenKey
    linaToken.address, // tokenAddress
    TOKEN_LOCK_TYPE_TRANSFER // lockType
  );
  await lnErc20Bridge.connect(admin).addToken(
    formatBytes32String("lUSD"), // tokenKey
    lusdToken.address, // tokenAddress
    TOKEN_LOCK_TYPE_TRANSFER // lockType
  );
  await lnErc20Bridge.connect(admin).addChainSupportForToken(
    formatBytes32String("LINA"), // tokenKey
    ETH_MAINNET_CHAIN_ID // chainId
  );
  await lnErc20Bridge.connect(admin).addChainSupportForToken(
    formatBytes32String("lUSD"), // tokenKey
    ETH_MAINNET_CHAIN_ID // chainId
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
