import { BigNumber } from "ethers";

export const zeroAddress: string = "0x0000000000000000000000000000000000000000";

export function expandTo18Decimals(num: number): BigNumber {
  return expandToNDecimals(num, 18);
}

function expandToNDecimals(num: number, n: number): BigNumber {
  while (!Number.isInteger(num)) {
    num *= 10;
    if (--n < 0) return BigNumber.from(0);
  }

  return BigNumber.from(num).mul(BigNumber.from(10).pow(n));
}
