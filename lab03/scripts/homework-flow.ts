import { encodePacked, keccak256, parseEther } from "viem";
import { network } from "hardhat";

const { viem } = await network.connect();

const publicClient = await viem.getPublicClient();
const walletClients = await viem.getWalletClients();

if (walletClients.length < 3) {
  throw new Error(
    "Need 3 configured Zircuit accounts (owner, alice, bob). Set ZIRCUIT_OWNER_PRIVATE_KEY, ZIRCUIT_ALICE_PRIVATE_KEY, and ZIRCUIT_BOB_PRIVATE_KEY in .env and fund those wallets for gas.",
  );
}

const [ownerClient, aliceClient, bobClient] = walletClients;

const bobGasTopUp = parseEther("0.001");
const bobNativeBalance = await publicClient.getBalance({ address: bobClient.account.address });

if (bobNativeBalance < bobGasTopUp) {
  const fundBobHash = await ownerClient.sendTransaction({
    to: bobClient.account.address,
    value: bobGasTopUp,
  });
  await publicClient.waitForTransactionReceipt({ hash: fundBobHash });
}

const token = await viem.deployContract("SignatureApproval", [], {
  client: { wallet: ownerClient },
});

const aliceAmount = parseEther("1000");
const transferToAliceHash = await token.write.transfer([aliceClient.account.address, aliceAmount], {
  account: ownerClient.account,
});
const transferToAliceReceipt = await publicClient.waitForTransactionReceipt({ hash: transferToAliceHash });

const owner = aliceClient.account.address;
const spender = bobClient.account.address;
const value = parseEther("120");
const nonce = await token.read.nonces([owner]);
const latestBlock = await publicClient.getBlock();
const deadline = latestBlock.timestamp + 3600n;

const packed = encodePacked(
  ["address", "address", "uint256", "uint256", "uint256", "address"],
  [owner, spender, value, nonce, deadline, token.address],
);
const hash = keccak256(packed);
const signature = await aliceClient.signMessage({
  account: aliceClient.account,
  message: { raw: hash },
});

const permitHash = await token.write.permit([owner, spender, value, nonce, deadline, signature], {
  account: bobClient.account,
});
const permitReceipt = await publicClient.waitForTransactionReceipt({ hash: permitHash });

const spendAmount = parseEther("50");
const transferFromHash = await token.write.transferFrom([owner, spender, spendAmount], {
  account: bobClient.account,
});
const transferFromReceipt = await publicClient.waitForTransactionReceipt({ hash: transferFromHash });

console.log("=== REQUIRED ADDRESSES ===");
console.log("Token:", token.address);
console.log("Owner:", ownerClient.account.address);
console.log("Alice:", aliceClient.account.address);
console.log("Bob:", bobClient.account.address);

const explorerBase = "https://explorer.garfield-testnet.zircuit.com";
console.log("\n=== CONTRACT VERIFICATION ===");
console.log("Verify command:  npx hardhat verify --network zircuit", token.address);
console.log("Explorer link:  ", `${explorerBase}/address/${token.address}`);

console.log("\n=== REQUIRED FLOW RECEIPTS (TX HASH) ===");
console.log("1. Owner transfer to Alice:", transferToAliceReceipt.transactionHash);
console.log("2. Bob submit permit:", permitReceipt.transactionHash);
console.log("3. Bob transferFrom Alice:", transferFromReceipt.transactionHash);

console.log("\n=== EXTRA DEBUG ===");
console.log("Signed permit payload hash:", hash);
console.log("Nonce after permit:", (await token.read.nonces([owner])).toString());
console.log("Remaining allowance Alice->Bob:", (await token.read.allowance([owner, spender])).toString());
console.log("Bob token balance:", (await token.read.balanceOf([spender])).toString());
