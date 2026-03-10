import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress, parseEther } from "viem";

import { network } from "hardhat";

describe("TokenTrade", async function () {
  const { viem } = await network.connect();

  async function deployFixture() {
    const tokenA = await viem.deployContract("TokenA");
    const tokenB = await viem.deployContract("TokenB");
    const trade = await viem.deployContract("P2PTokenTrade", [tokenA.address, tokenB.address]);

    const publicClient = await viem.getPublicClient();
    const [owner, alice, bob] = await viem.getWalletClients();

    const seedAmount = parseEther("1000000");
    await tokenA.write.transfer([alice.account.address, seedAmount]);
    await tokenA.write.transfer([bob.account.address, seedAmount]);
    await tokenB.write.transfer([alice.account.address, seedAmount]);
    await tokenB.write.transfer([bob.account.address, seedAmount]);

    return { tokenA, tokenB, trade, publicClient, owner, alice, bob };
  }

  it("tokens are deployed with 100,000,000 supply and 18 decimals", async function () {
    const { tokenA, tokenB } = await deployFixture();

    assert.equal(await tokenA.read.decimals(), 18);
    assert.equal(await tokenB.read.decimals(), 18);
    assert.equal(await tokenA.read.totalSupply(), parseEther("100000000"));
    assert.equal(await tokenB.read.totalSupply(), parseEther("100000000"));
  });

  it("setupTrade escrows tokens and emits TradeCreated", async function () {
    const { tokenA, trade, publicClient, alice } = await deployFixture();

    const amountIn = parseEther("1000");
    const askOut = parseEther("250");
    const now = await publicClient.getBlock();
    const expiry = now.timestamp + 3600n;

    await tokenA.write.approve([trade.address, amountIn], { account: alice.account });

    const txHash = await trade.write.setupTrade([tokenA.address, amountIn, askOut, expiry], {
      account: alice.account,
    });

    await viem.assertions.emitWithArgs(Promise.resolve(txHash), trade, "TradeCreated", [
      0n,
      getAddress(alice.account.address),
      getAddress(tokenA.address),
      amountIn,
      askOut,
      expiry,
    ]);

    const contractBal = await tokenA.read.balanceOf([trade.address]);
    assert.equal(contractBal, amountIn);

    const stored = await trade.read.trades([0n]);
    assert.equal(stored[0], getAddress(alice.account.address));
    assert.equal(stored[1], getAddress(tokenA.address));
    assert.equal(stored[2], amountIn);
    assert.equal(stored[3], askOut);
    assert.equal(stored[4], expiry);
    assert.equal(stored[5], true);
  });

  it("settleTrade before expiry transfers assets, charges 0.1% fee, and emits TradeSettled", async function () {
    const { tokenA, tokenB, trade, publicClient, alice, bob } = await deployFixture();

    const amountIn = parseEther("1000");
    const askOut = parseEther("200");
    const now = await publicClient.getBlock();
    const expiry = now.timestamp + 7200n;

    await tokenA.write.approve([trade.address, amountIn], { account: alice.account });
    await trade.write.setupTrade([tokenA.address, amountIn, askOut, expiry], { account: alice.account });

    const aliceTokenBBefore = await tokenB.read.balanceOf([alice.account.address]);
    const bobTokenABefore = await tokenA.read.balanceOf([bob.account.address]);

    await tokenB.write.approve([trade.address, askOut], { account: bob.account });

    const settleTx = await trade.write.settleTrade([0n], { account: bob.account });

    const fee = amountIn / 1000n;

    await viem.assertions.emitWithArgs(Promise.resolve(settleTx), trade, "TradeSettled", [
      0n,
      getAddress(alice.account.address),
      getAddress(bob.account.address),
      getAddress(tokenA.address),
      amountIn,
      askOut,
      fee,
    ]);

    assert.equal(await tokenB.read.balanceOf([alice.account.address]), aliceTokenBBefore + askOut);
    assert.equal(await tokenA.read.balanceOf([bob.account.address]), bobTokenABefore + (amountIn - fee));
    assert.equal(await trade.read.accumulatedFees([tokenA.address]), fee);

    const stored = await trade.read.trades([0n]);
    assert.equal(stored[5], false);
  });

  it("expired trade cannot be settled and creator can cancel to reclaim escrow", async function () {
    const { tokenA, tokenB, trade, publicClient, alice, bob } = await deployFixture();

    const amountIn = parseEther("100");
    const askOut = parseEther("50");
    const now = await publicClient.getBlock();
    const expiry = now.timestamp + 300n;

    await tokenA.write.approve([trade.address, amountIn], { account: alice.account });
    await trade.write.setupTrade([tokenA.address, amountIn, askOut, expiry], { account: alice.account });

    await publicClient.request({ method: "evm_increaseTime", params: [301] });
    await publicClient.request({ method: "evm_mine", params: [] });

    await tokenB.write.approve([trade.address, askOut], { account: bob.account });
    await assert.rejects(
      trade.write.settleTrade([0n], { account: bob.account }),
      /Trade expired/,
    );

    const aliceBeforeCancel = await tokenA.read.balanceOf([alice.account.address]);
    await trade.write.cancelExpiredTrade([0n], { account: alice.account });
    assert.equal(await tokenA.read.balanceOf([alice.account.address]), aliceBeforeCancel + amountIn);
  });

  it("only owner can withdraw fees and withdrawFee collects all accumulated fees", async function () {
    const { tokenA, tokenB, trade, owner, alice, bob } = await deployFixture();

    const amountIn = parseEther("1000");
    const askOut = parseEther("300");
    const expiry = 9999999999n;

    await tokenA.write.approve([trade.address, amountIn], { account: alice.account });
    await trade.write.setupTrade([tokenA.address, amountIn, askOut, expiry], { account: alice.account });

    await tokenB.write.approve([trade.address, askOut], { account: bob.account });
    await trade.write.settleTrade([0n], { account: bob.account });

    await viem.assertions.revertWithCustomError(
      trade.write.withdrawFee({ account: alice.account }),
      trade,
      "OwnableUnauthorizedAccount",
      [alice.account.address],
    );

    const ownerBefore = await tokenA.read.balanceOf([owner.account.address]);
    const fee = amountIn / 1000n;

    await trade.write.withdrawFee({ account: owner.account });

    const ownerAfter = await tokenA.read.balanceOf([owner.account.address]);
    assert.equal(ownerAfter, ownerBefore + fee);
    assert.equal(await trade.read.accumulatedFees([tokenA.address]), 0n);
  });
});
