import { ethers, upgrades } from "hardhat";
import { expandTo18Decimals, zeroAddress } from "../utilities";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const lnAssetSystemAddress = "0x1B220E982e5b4615715870533e968dff823BBED6";
  const lnAccessControlAddress = "0x7b260D7851d9DC9EE27Dc8d6fAbDB2d568711708";
  const lnConfigAddress = "0x6Eaaa70AE37aAEA71e400F86199B83dA8E0E9455";
  const lusdAddress = "0x23e8a70534308a4AAF76fb8C32ec13d17a3BD89e";
  const lnRewardSystemAddress = "0x9C86c4764E59A336C108A6F85be48F8a9a7FaD85";
  const lnOracleRouterAddress = "0x475aa5fCdf2eAEAecE4F6E83121324cB293911AB";

  const foundationFeeHolder = "0xAdBEfE7b1Cd46a2A15ED00d25B1580E2F3903BB8";
  const insuranceFundHolder = "0x4cE10bF4A36ab5519f7c5398e78b6b658DdAdbcc";

  const perps = [
    {
      symbol: "lBTC",
      tokenAddress: "0x90C58dDA82bEabc018Faa02fF885bcbc038a6513",
      minInitMargin: expandTo18Decimals(0.95),
      maintenanceMargin: expandTo18Decimals(0.2),
      feeRate: expandTo18Decimals(0.0025),
      liquidatorRewardRatio: expandTo18Decimals(0.05),
      insuranceFundContributionRatio: expandTo18Decimals(0.75),
    },
    {
      symbol: "lETH",
      tokenAddress: "0x866F41ef8f65c8B29016331b91B39189928428c9",
      minInitMargin: expandTo18Decimals(0.95),
      maintenanceMargin: expandTo18Decimals(0.2),
      feeRate: expandTo18Decimals(0.0025),
      liquidatorRewardRatio: expandTo18Decimals(0.05),
      insuranceFundContributionRatio: expandTo18Decimals(0.75),
    },
  ];

  const [
    LnAccessControl,
    LnAssetSystem,
    LnPerpetual,
    LnPerpExchange,
    LnPerpPositionToken,
  ] = await Promise.all(
    [
      "LnAccessControl",
      "LnAssetSystem",
      "LnPerpetual",
      "LnPerpExchange",
      "LnPerpPositionToken",
    ].map((contractName) => ethers.getContractFactory(contractName, deployer))
  );

  const lnAssetSystem = LnAssetSystem.attach(lnAssetSystemAddress);
  const lnAccessControl = LnAccessControl.attach(lnAccessControlAddress);

  console.log("Upgrading LnAssetSystem...");
  await upgrades.upgradeProxy(lnAssetSystemAddress, LnAssetSystem);

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
  console.log(
    "LnPerpPositionToken proxy deployed to:",
    lnPerpPositionToken.address
  );

  /**
   * Create perpetual exchange. Uses temporary address for holding insurance fund.
   * Switch to contract later.
   */
  const lnPerpExchange = await upgrades.deployProxy(
    LnPerpExchange,
    [
      lnAssetSystem.address, // _lnAssetSystem
      lnConfigAddress, // _lnConfig
      lnPerpPositionToken.address, // _positionToken
      lusdAddress, // _lusdToken
      insuranceFundHolder, // _insuranceFundHolder
    ],
    {
      initializer: "__LnPerpExchange_init",
    }
  );
  console.log("LnPerpExchange proxy deployed to:", lnPerpExchange.address);

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
   * Set LnPerpExchange pool fee holder to LnRewardSystem
   */
  await lnPerpExchange.connect(admin).setPoolFeeHolder(lnRewardSystemAddress);
  await lnPerpExchange
    .connect(admin)
    .setFoundationFeeHolder(foundationFeeHolder);

  for (const perp of perps) {
    /**
     * Create perpetual contract
     */
    const perpContract = await upgrades.deployProxy(
      LnPerpetual,
      [
        lnPerpExchange.address, // _exchange
        lnPerpPositionToken.address, // _positionToken
        lusdAddress, // _lusdToken
        perp.tokenAddress, // _underlyingToken
        lnOracleRouterAddress, // _lnPrices
        perp.minInitMargin, // _minInitMargin
        perp.maintenanceMargin, // _maintenanceMargin
        perp.feeRate, // _feeRate
        perp.liquidatorRewardRatio, // _liquidatorRewardRatio
        perp.insuranceFundContributionRatio, // _insuranceFundContributionRatio
      ],
      {
        initializer: "__LnPerpetual_init",
      }
    );
    console.log(
      `${perp.symbol} perp contract proxy deployed to:`,
      perpContract.address
    );

    /**
     * Register perp on `LnAssetSystem`
     */
    await lnAssetSystem.connect(admin).addPerp(perpContract.address);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
