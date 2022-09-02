import { ethers } from "hardhat";

const { formatBytes32String } = ethers.utils;

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const exchangeAddress = "0x2C33d6Fa54bB6Fa81B3a569D639Fe23ab36cca7f";

  const LnExchangeSystem = await ethers.getContractFactory("LnExchangeSystem", {
    signer: deployer,
    libraries: {
      "contracts/SafeDecimalMath.sol:SafeDecimalMath":
        "0xC065a00fbf75366D8D228f856D470C3A7c4D928c",
    },
  });

  const lnExchangeSystem = LnExchangeSystem.attach(exchangeAddress);

  await lnExchangeSystem.connect(admin).setAssetExitPositionOnly(
    formatBytes32String("lWTI"), // asset
    true // newValue
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });