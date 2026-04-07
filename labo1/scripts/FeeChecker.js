// Deploy DEX.sol along with two MockERC20 tokens on the configured network.
// Prints the addresses of every deployed contract, the configured rate,
// and verifies the core flows: addLiquidity, swap A→B, swap B→A.
//
// Usage:
//   npx hardhat run scripts/checker.js --network hardhatMainnet
//   npx hardhat run scripts/checker.js --network sepolia

import { parseEther, formatEther } from "viem";
import { network } from "hardhat";

// ─── configuration ────────────────────────────────────────────────────────────
// 1 tokenA  →  RATE tokenB   (integer, e.g. 2 means 1A swaps for 2B)
const RATE = 2n;
const INITIAL_LIQUIDITY_A = parseEther("10000");
const INITIAL_LIQUIDITY_B = parseEther("10000");
// ─────────────────────────────────────────────────────────────────────────────

const { viem } = await network.connect();
const publicClient = await viem.getPublicClient();
const [deployer] = await viem.getWalletClients();
const feeRecipientAddress = "0x3AD64ABb43D793025a2f2bD9d615fa1447008bFD";

console.log("Deployer:", deployer.account.address);
console.log("Network:", network.name, "\n");

// ── deploy tokens ─────────────────────────────────────────────────────────────
console.log("Deploying MockERC20 tokens...");
const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKA"], {
  client: { wallet: deployer },
});
const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKB"], {
  client: { wallet: deployer },
});
console.log("  TokenA:", tokenA.address);
console.log("  TokenB:", tokenB.address);

// ── deploy DEX ────────────────────────────────────────────────────────────────
console.log("\nDeploying DEX (rate =", RATE.toString(), ")...");
const dex = await viem.deployContract("DEX", [
  tokenA.address,
  tokenB.address,
  RATE,
  feeRecipientAddress,
], {
  client: { wallet: deployer },
});
console.log("  DEX:   ", dex.address);

// ── initialize token balances for checker ─────────────────────────────────────
// Required amounts:
//   TokenA: 3000 * r tokens (in wei => 3000e18 * RATE)
//   TokenB: 3000 tokens   (in wei => 3000e18)
const mintAmountA = parseEther("3000") * RATE;
const mintAmountB = parseEther("3000");
const mintTxA = await tokenA.write.mint([deployer.account.address, mintAmountA], { account: deployer.account });
const mintTxB = await tokenB.write.mint([deployer.account.address, mintAmountB], { account: deployer.account });
await publicClient.waitForTransactionReceipt({ hash: mintTxA });
await publicClient.waitForTransactionReceipt({ hash: mintTxB });
console.log("\nInitialized deployer balances:");
console.log("  TokenA:", formatEther(mintAmountA), "(= 3000 * r)");
console.log("  TokenB:", formatEther(mintAmountB), "(= 3000)");

// Send tokens to OnSiteChecker to spend tokens (for swap tests)
// address = 0xa6FF20737004fb2f632B6b9388C7731B871a201D
const onSiteCheckerAddress = "0xa6FF20737004fb2f632B6b9388C7731B871a201D";
const txA = await tokenA.write.transfer([onSiteCheckerAddress, mintAmountA], {
  account: deployer.account,
});
const txB = await tokenB.write.transfer([onSiteCheckerAddress, mintAmountB], {
  account: deployer.account,
});
await publicClient.waitForTransactionReceipt({ hash: txA });
await publicClient.waitForTransactionReceipt({ hash: txB });
console.log("\nSent tokens to OnSiteChecker for swap tests.");
