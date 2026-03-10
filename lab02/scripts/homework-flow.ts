import { parseEther } from "viem";
import { network } from "hardhat";

const { viem } = await network.connect();

const publicClient = await viem.getPublicClient();
const walletClients = await viem.getWalletClients();

if (walletClients.length < 3) {
  throw new Error(
    "Need at least 3 configured accounts (owner, alice, bob). Add more private keys for this network.",
  );
}

const [ownerClient, aliceClient, bobClient] = walletClients;

const tokenA = await viem.deployContract("TokenA", [], { client: { wallet: ownerClient } });
const tokenB = await viem.deployContract("TokenB", [], { client: { wallet: ownerClient } });
const trade = await viem.deployContract("P2PTokenTrade", [tokenA.address, tokenB.address], {
  client: { wallet: ownerClient },
});

const seedAmount = parseEther("1000");
await tokenA.write.transfer([aliceClient.account.address, seedAmount], { account: ownerClient.account });
await tokenB.write.transfer([bobClient.account.address, seedAmount], { account: ownerClient.account });

const latestBlock = await publicClient.getBlock();
const amountIn = parseEther("100");
const askOut = parseEther("25");
const expiry = latestBlock.timestamp + 3600n;

await tokenA.write.approve([trade.address, amountIn], { account: aliceClient.account });
const setupTradeHash = await trade.write.setupTrade([tokenA.address, amountIn, askOut, expiry], {
  account: aliceClient.account,
});
const setupTradeReceipt = await publicClient.waitForTransactionReceipt({ hash: setupTradeHash });

await tokenB.write.approve([trade.address, askOut], { account: bobClient.account });
const settleTradeHash = await trade.write.settleTrade([0n], { account: bobClient.account });
const settleTradeReceipt = await publicClient.waitForTransactionReceipt({ hash: settleTradeHash });

const withdrawHash = await trade.write.withdrawFee({ account: ownerClient.account });
const withdrawReceipt = await publicClient.waitForTransactionReceipt({ hash: withdrawHash });

console.log("=== REQUIRED ADDRESSES ===");
console.log("TokenA:", tokenA.address);
console.log("TokenB:", tokenB.address);
console.log("Trade:", trade.address);
console.log("Owner:", ownerClient.account.address);
console.log("Alice:", aliceClient.account.address);
console.log("Bob:", bobClient.account.address);

console.log("\n=== REQUIRED RECEIPTS (TX HASH) ===");
console.log("Alice setupTrade:", setupTradeReceipt.transactionHash);
console.log("Bob settleTrade:", settleTradeReceipt.transactionHash);
console.log("Owner withdrawFee:", withdrawReceipt.transactionHash);

console.log("\n=== RECEIPT STATUS ===");
console.log("setupTrade status:", setupTradeReceipt.status, "block:", setupTradeReceipt.blockNumber.toString());
console.log("settleTrade status:", settleTradeReceipt.status, "block:", settleTradeReceipt.blockNumber.toString());
console.log("withdrawFee status:", withdrawReceipt.status, "block:", withdrawReceipt.blockNumber.toString());
