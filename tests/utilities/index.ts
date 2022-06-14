import Big, { RoundingMode } from "big.js";
import { BigNumber } from "ethers";

export const zeroAddress: string = "0x0000000000000000000000000000000000000000";
export const nullAddress: string = "0x000000000000000000000000000000000000dEaD";
export const uint32Max: BigNumber = BigNumber.from("0xffffffff");
export const uint128Max: BigNumber = BigNumber.from(
  "0xffffffffffffffffffffffffffffffff"
);
export const uint256Max: BigNumber = BigNumber.from(
  "0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff"
);

export function expandTo18Decimals(num: number): BigNumber {
  return expandToNDecimals(num, 18);
}

export function expandToNDecimals(num: number, n: number): BigNumber {
  let bigNum = new Big(num);

  while (!bigNum.round(0, RoundingMode.RoundDown).eq(bigNum)) {
    bigNum = bigNum.mul(10);
    if (--n < 0) return BigNumber.from(0);
  }

  return BigNumber.from(bigNum.toString()).mul(BigNumber.from(10).pow(n));
}
