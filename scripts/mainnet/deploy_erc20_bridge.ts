import { formatBytes32String } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

const TOKEN_LOCK_TYPE_TRANSFER: number = 1;
const TOKEN_LOCK_TYPE_MINT_BURN: number = 2;

const BSC_MAINNET_CHAIN_ID: number = 56;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const linaTokenAddress: string = "0x3E9BC21C9b189C09dF3eF1B824798658d5011937";
  const lusdTokenAddress: string = "0xc3C6cf6Bbca7B759d23a2586e80F795C57A32beF";

  const relayerAddress: string = "0xd8A059Bd3307F64E759D139E5e4490e622Fcb862";

  const LnAccessControl = await ethers.getContractFactory("LnAccessControl");
  const LnErc20Bridge = await ethers.getContractFactory("LnErc20Bridge");

  const lnAccessControl = LnAccessControl.attach(
    "0x448dFcc4fFbbF5a0D59eBe4f0008a51b8C547689"
  );

  const lnErc20Bridge = await upgrades.deployProxy(
    LnErc20Bridge,
    [
      relayerAddress, // _relayer
      admin.address, // _admin
    ],
    {
      initializer: "__LnErc20Bridge_init",
    }
  );
  console.log("LnErc20Bridge proxy deployed to:", lnErc20Bridge.address);

  /**
   * Configure token bridge
   */
  await lnErc20Bridge.connect(admin).addToken(
    formatBytes32String("LINA"), // tokenKey
    linaTokenAddress, // tokenAddress
    TOKEN_LOCK_TYPE_TRANSFER // lockType
  );
  await lnErc20Bridge.connect(admin).addToken(
    formatBytes32String("lUSD"), // tokenKey
    lusdTokenAddress, // tokenAddress
    TOKEN_LOCK_TYPE_MINT_BURN // lockType
  );
  await lnErc20Bridge.connect(admin).addChainSupportForToken(
    formatBytes32String("LINA"), // tokenKey
    BSC_MAINNET_CHAIN_ID // chainId
  );
  await lnErc20Bridge.connect(admin).addChainSupportForToken(
    formatBytes32String("lUSD"), // tokenKey
    BSC_MAINNET_CHAIN_ID // chainId
  );

  /**
   * Allow the token bridge to mint and burn assets
   */
  await lnAccessControl
    .connect(admin)
    .SetIssueAssetRole([lnErc20Bridge.address], [true]);
  await lnAccessControl
    .connect(admin)
    .SetBurnAssetRole([lnErc20Bridge.address], [true]);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
