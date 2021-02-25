import { ethers, upgrades } from "hardhat";
import { formatBytes32String } from "ethers/lib/utils";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const accessControlAddress = "0x7b260D7851d9DC9EE27Dc8d6fAbDB2d568711708";
  const configAddress = "0x6Eaaa70AE37aAEA71e400F86199B83dA8E0E9455";
  const exchangeAddress = "0x2C33d6Fa54bB6Fa81B3a569D639Fe23ab36cca7f";

  const liquidAddresses = [
    {
      symbol: "lUSD",
      address: "0x23e8a70534308a4AAF76fb8C32ec13d17a3BD89e",
    },
    {
      symbol: "lBTC",
      address: "0x90C58dDA82bEabc018Faa02fF885bcbc038a6513",
    },
    {
      symbol: "lETH",
      address: "0x866F41ef8f65c8B29016331b91B39189928428c9",
    },
    {
      symbol: "lLINK",
      address: "0x5901015d14d225382A42aC9b75f901FF3Eb8c7D2",
    },
    {
      symbol: "lTRX",
      address: "0xe8f5d7c61126C804f164A10a2441745B0D2C4aA5",
    },
    {
      symbol: "lDOT",
      address: "0xe21712846d7a98b4312144e88D15b83A980879CE",
    },
    {
      symbol: "lYFI",
      address: "0xeC9e4cc4602D86428fea4E40698864D674A5D4dB",
    },
    {
      symbol: "lBNB",
      address: "0x3B8d6D785F2f0eCb70F6629E53690c8C0258C6EF",
    },
    {
      symbol: "lADA",
      address: "0xdE333eff717fB7e1D77f7C4dF3bA1Cb179305201",
    },
    {
      symbol: "lXLM",
      address: "0xfC32f0F5bc37dAcB5F6425fb7CAD45c72C88fe03",
    },
    {
      symbol: "lXAU",
      address: "0x724fA08cAE1ff6Ba685d3C7BFe02aC53d408D662",
    },
    {
      symbol: "lXAG",
      address: "0x09edB8237E8C27e6B58fEDf7257CCE501A61a790",
    },
  ];

  // Load contracts
  const LnAccessControl = await ethers.getContractFactory("LnAccessControl");
  const LnAssetUpgradeable = await ethers.getContractFactory(
    "LnAssetUpgradeable"
  );
  const LnConfig = await ethers.getContractFactory("LnConfig");
  const LnExchangeSystem = await ethers.getContractFactory("LnExchangeSystem", {
    signer: deployer,
    libraries: {
      "contracts/SafeDecimalMath.sol:SafeDecimalMath":
        "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
    },
  });

  console.log("Upgrading liquid token contracts...");
  for (const liquid of liquidAddresses) {
    console.log(`Upgrading ${liquid.symbol} token contract...`);
    await upgrades.upgradeProxy(liquid.address, LnAssetUpgradeable);
  }

  const lnAccessControl = LnAccessControl.attach(accessControlAddress);
  const lnConfig = LnConfig.attach(configAddress);

  console.log("Granting MOVE_ASSET role to LnExchangeSystem...");
  await lnAccessControl.connect(admin).SetRoles(
    formatBytes32String("MOVE_ASSET"), // roleType
    [exchangeAddress], // addresses
    [true] // setTo
  );

  console.log("Setting config item TradeSettlementDelay...");
  await lnConfig.connect(admin).setUint(
    formatBytes32String("TradeSettlementDelay"), // key
    65 // value
  );

  console.log("Upgrading exchange contract...");
  await upgrades.upgradeProxy(exchangeAddress, LnExchangeSystem, {
    unsafeAllowLinkedLibraries: true,
  });

  const lnExchangeSystem = LnExchangeSystem.attach(exchangeAddress);

  console.log("Disabling exit-only mode...");
  await lnExchangeSystem.connect(admin).setExitPositionOnly(
    false // newValue
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
