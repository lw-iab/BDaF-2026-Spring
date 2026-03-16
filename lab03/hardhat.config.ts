import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";
import "dotenv/config";

function normalizePrivateKey(key?: string): string | undefined {
  if (key === undefined || key.trim() === "") {
    return undefined;
  }

  return key.startsWith("0x") ? key : `0x${key}`;
}

function getZircuitAccounts(): string[] {
  const privateKeys = [
    process.env.ZIRCUIT_OWNER_PRIVATE_KEY,
    process.env.ZIRCUIT_ALICE_PRIVATE_KEY,
    process.env.ZIRCUIT_BOB_PRIVATE_KEY,
    process.env.ZIRCUIT_PRIVATE_KEY,
  ]
    .map(normalizePrivateKey)
    .filter((key): key is string => key !== undefined);

  return [...new Set(privateKeys)];
}

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    zircuit: {
      type: "http",
      url: process.env.ZIRCUIT_RPC_URL!,
      accounts: getZircuitAccounts(),
    },
  },
  sourcify: {
    enabled: true // This is the preferred method for Zircuit
  },
});
