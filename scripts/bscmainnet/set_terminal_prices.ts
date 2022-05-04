import { BigNumber } from "ethers";
import { ethers } from "hardhat";
import { LnOracleRouter__factory } from "../../typechain";

async function main() {
  const [deployer] = await ethers.getSigners();
  const admin = deployer;

  const oracleRouterAddress = "0x475aa5fCdf2eAEAecE4F6E83121324cB293911AB";

  const oracleRouter = LnOracleRouter__factory.connect(
    oracleRouterAddress,
    admin
  );

  await oracleRouter.addTerminalPriceOracles(
    ["lXLCI", "lXBCI"].map((item) => ethers.utils.formatBytes32String(item)),
    [
      BigNumber.from("653401845912000000000"),
      BigNumber.from("923170688317000000000"),
    ],
    true
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
