import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress, parseEther } from "viem";

import { network } from "hardhat";

describe("EthVault", async function () {
  const { viem } = await network.connect();
  const publicClient = await viem.getPublicClient();
  const [ownerClient, otherClient, thirdClient] = await viem.getWalletClients();

  async function depositToVault(vault, senderClient, amount) {
    const txHash = await senderClient.sendTransaction({
      to: vault.address,
      value: amount,
    });
    await publicClient.waitForTransactionReceipt({ hash: txHash });
    return txHash;
  }

  async function getVaultBalance(vault) {
    return publicClient.getBalance({ address: vault.address });
  }

  describe("Test Group A — Deposits", function () {
    it("single deposit: accepts ETH, emits Deposit, and increases balance", async function () {
      const vault = await viem.deployContract("EthVault");
      const amount = parseEther("1");

      const txHash = await depositToVault(vault, ownerClient, amount);

      await viem.assertions.emitWithArgs(
        Promise.resolve(txHash),
        vault,
        "Deposit",
        [getAddress(ownerClient.account.address), amount],
      );

      const finalVaultBalance = await getVaultBalance(vault);
      assert.equal(finalVaultBalance, amount);
    });

    it("multiple deposits: accumulates balance and emits once per transfer", async function () {
      const vault = await viem.deployContract("EthVault");
      const amountA = parseEther("0.2");
      const amountB = parseEther("0.35");
      const startBlock = await publicClient.getBlockNumber();

      await depositToVault(vault, ownerClient, amountA);
      await depositToVault(vault, ownerClient, amountB);

      const events = await publicClient.getContractEvents({
        address: vault.address,
        abi: vault.abi,
        eventName: "Deposit",
        fromBlock: startBlock,
        strict: true,
      });

      assert.equal(events.length, 2);
      assert.equal(events[0].args.amount, amountA);
      assert.equal(events[1].args.amount, amountB);

      const finalVaultBalance = await getVaultBalance(vault);
      assert.equal(finalVaultBalance, amountA + amountB);
    });

    it("different senders: records sender and amount correctly", async function () {
      const vault = await viem.deployContract("EthVault");
      const ownerAmount = parseEther("0.1");
      const otherAmount = parseEther("0.3");
      const startBlock = await publicClient.getBlockNumber();

      await depositToVault(vault, ownerClient, ownerAmount);
      await depositToVault(vault, otherClient, otherAmount);

      const events = await publicClient.getContractEvents({
        address: vault.address,
        abi: vault.abi,
        eventName: "Deposit",
        fromBlock: startBlock,
        strict: true,
      });

      assert.equal(events.length, 2);
      assert.equal(events[0].args.sender, getAddress(ownerClient.account.address));
      assert.equal(events[0].args.amount, ownerAmount);
      assert.equal(events[1].args.sender, getAddress(otherClient.account.address));
      assert.equal(events[1].args.amount, otherAmount);

      const finalVaultBalance = await getVaultBalance(vault);
      assert.equal(finalVaultBalance, ownerAmount + otherAmount);
    });
  });

  describe("Test Group B — Owner Withdrawal", function () {
    it("owner can withdraw partial amount, emits event, and balance decreases", async function () {
      const vault = await viem.deployContract("EthVault");
      const depositAmount = parseEther("1.5");
      const withdrawAmount = parseEther("0.4");

      await depositToVault(vault, ownerClient, depositAmount);

      await viem.assertions.emitWithArgs(
        vault.write.withdraw([withdrawAmount]),
        vault,
        "Weethdraw",
        [getAddress(ownerClient.account.address), withdrawAmount],
      );

      const finalVaultBalance = await getVaultBalance(vault);
      assert.equal(finalVaultBalance, depositAmount - withdrawAmount);
    });

    it("owner can withdraw full balance and vault balance becomes zero", async function () {
      const vault = await viem.deployContract("EthVault");
      const depositAmount = parseEther("0.75");

      await depositToVault(vault, ownerClient, depositAmount);

      await viem.assertions.emitWithArgs(
        vault.write.withdraw([depositAmount]),
        vault,
        "Weethdraw",
        [getAddress(ownerClient.account.address), depositAmount],
      );

      const finalVaultBalance = await getVaultBalance(vault);
      assert.equal(finalVaultBalance, 0n);
    });
  });

  describe("Test Group C — Unauthorized Withdrawal", function () {
    it("non-owner cannot withdraw, balance unchanged, emits UnauthorizedWithdrawAttempt, and does not revert", async function () {
      const vault = await viem.deployContract("EthVault");
      const depositAmount = parseEther("1");
      const requestedAmount = parseEther("0.6");

      await depositToVault(vault, ownerClient, depositAmount);

      await assert.doesNotReject(async () => {
        await viem.assertions.emitWithArgs(
          vault.write.withdraw([requestedAmount], { account: otherClient.account }),
          vault,
          "UnauthorizedWithdrawAttempt",
          [getAddress(otherClient.account.address), requestedAmount],
        );
      });

      const finalVaultBalance = await getVaultBalance(vault);
      assert.equal(finalVaultBalance, depositAmount);
    });
  });

  describe("Test Group D — Edge Cases", function () {
    it("withdraw more than balance reverts with InsufficientBalance", async function () {
      const vault = await viem.deployContract("EthVault");
      const depositAmount = parseEther("0.1");
      const tooMuch = parseEther("0.11");

      await depositToVault(vault, ownerClient, depositAmount);

      await viem.assertions.revertWithCustomError(
        vault.write.withdraw([tooMuch]),
        vault,
        "InsufficientBalance",
        [tooMuch, depositAmount],
      );
    });

    it("withdraw zero by owner emits event with 0 amount and keeps balance unchanged", async function () {
      const vault = await viem.deployContract("EthVault");
      const depositAmount = parseEther("0.9");

      await depositToVault(vault, ownerClient, depositAmount);

      await viem.assertions.emitWithArgs(
        vault.write.withdraw([0n]),
        vault,
        "Weethdraw",
        [getAddress(ownerClient.account.address), 0n],
      );

      const finalVaultBalance = await getVaultBalance(vault);
      assert.equal(finalVaultBalance, depositAmount);
    });

    it("handles multiple deposits before owner withdrawal", async function () {
      const vault = await viem.deployContract("EthVault");
      const amountA = parseEther("0.4");
      const amountB = parseEther("0.3");
      const amountC = parseEther("0.2");
      const withdrawAmount = parseEther("0.5");

      await depositToVault(vault, ownerClient, amountA);
      await depositToVault(vault, otherClient, amountB);
      await depositToVault(vault, thirdClient, amountC);

      await viem.assertions.emitWithArgs(
        vault.write.withdraw([withdrawAmount]),
        vault,
        "Weethdraw",
        [getAddress(ownerClient.account.address), withdrawAmount],
      );

      const finalVaultBalance = await getVaultBalance(vault);
      assert.equal(finalVaultBalance, amountA + amountB + amountC - withdrawAmount);
    });
  });
});
