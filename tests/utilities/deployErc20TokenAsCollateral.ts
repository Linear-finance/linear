import { ethers } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expandTo18Decimals } from ".";
import { Contract } from "ethers";
import { formatBytes32String } from "ethers/lib/utils";

export const deployErc20TokenAsCollateral = async (
  name: string,
  symbol: string,
  lnCollateralSystem: Contract,
  deployer: SignerWithAddress,
  admin: SignerWithAddress
): Promise<Contract> => {
  const BUSDToken = await ethers.getContractFactory("MockERC20", deployer);

  const busdToken = await BUSDToken.deploy(
    name, // _name
    symbol // _symbol
  );

  /**
   * Register BUSD on `LnCollateralSystem`
   */
  await lnCollateralSystem.connect(admin).UpdateTokenInfo(
    formatBytes32String(symbol), // _currency
    busdToken.address, // _tokenAddr
    expandTo18Decimals(1), // _minCollateral
    false // _close
  );

  return busdToken;
};
