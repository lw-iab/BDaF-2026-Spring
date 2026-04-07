import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getAddress, parseEther } from "viem";
import { network } from "hardhat";

describe("Sepolia calls", async function () {
    const { viem } = await network.connect("sepolia");

    // StakeForNFT contract address
    const stakeAddr = getAddress("0xa73caE55DF45E8902c5A9df832D1705d6232f61E");

    // Get public client and wallet client
    const publicClient = await viem.getPublicClient();
    const [owner] = await viem.getWalletClients();

    // Deploy proxy contract and get token proxy address
    const proxyDeployer = await viem.deployContract("MyERC20Proxy");
    const tokenProxyAddr = await proxyDeployer.read.token();

    // ERC20 ABI at proxy address
    const token = await viem.getContractAt("MyERC20V1", tokenProxyAddr);
    const stakeForNFT = await viem.getContractAt("StakeForNFT", stakeAddr);

    // Constants for the test
    const amount = parseEther("1");
    const studentId = "111550078";

    it("approve + stake + unstake + mint", async function () {
        // 1) Approve StakeForNFT to spend your token
        console.log("Approving StakeForNFT to spend your token...");
        const approveTx = await token.write.approve([stakeAddr, amount], { account: owner.account });
        // Note: Wait for approval to be mined before calling stake() (otherwise stake() will fail)
        await publicClient.waitForTransactionReceipt({ hash: approveTx });

        // 2) Call stake(token, amount, studentId)
        console.log("Staking tokens...");
        const stakeTx = await stakeForNFT.write.stake([tokenProxyAddr, amount, studentId], {
            account: owner.account,
        });
        await publicClient.waitForTransactionReceipt({ hash: stakeTx });

        // 3) Try unstake() (no args)
        // log the balance of the token in stakeForNFT before unstaking (should be 1 token)
        console.log("Unstaking tokens...");
        const unstakeTx = await stakeForNFT.write.unstake([], {
            account: owner.account,
        });
        await publicClient.waitForTransactionReceipt({ hash: unstakeTx });

        if (stakeBalance !== 0n || stakeAddrBalance !== 0n) {
            console.log("Unstake left non-zero balance. Upgrading token implementation...");

            const tokenV2Impl = await viem.deployContract("MyERC20V2");
            const upgradeTx = await proxyDeployer.write.upgradeToken([tokenV2Impl.address, "0x"], {
                account: owner.account,
            });
            await publicClient.waitForTransactionReceipt({ hash: upgradeTx });
            console.log("Upgrade Tx Hash:", upgradeTx);

            const upgradedToken = await viem.getContractAt("MyERC20V2", tokenProxyAddr);
        }

        // 4) Try mint() (no args)
        console.log("Minting NFT...");
        const mintTx = await stakeForNFT.write.mint([], {
            account: owner.account,
        });
        await publicClient.waitForTransactionReceipt({ hash: mintTx });

        // print address of proxy contract
        console.log("Token Proxy Address:", tokenProxyAddr);
        // print the hash of each transaction
        console.log("Approve Tx Hash:", approveTx);
        console.log("Stake Tx Hash:", stakeTx);
        console.log("Unstake Tx Hash:", unstakeTx);
        console.log("Mint Tx Hash:", mintTx);
    });
});
