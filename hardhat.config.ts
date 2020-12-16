import "@nomiclabs/hardhat-waffle";

export default {
  solidity: {
    version: "0.6.12",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999,
      },
      evmVersion: "istanbul",
    },
  },
};
