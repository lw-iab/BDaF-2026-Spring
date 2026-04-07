import { network } from "hardhat";
import { formatEther } from "viem";

const { viem } = await network.connect("sepolia");
const [wallet] = await viem.getWalletClients();
const publicClient = await viem.getPublicClient();
const balance = await publicClient.getBalance({ address: wallet.account.address });

console.log("Address:", wallet.account.address);
console.log("Balance (Sepolia ETH):", formatEther(balance));
