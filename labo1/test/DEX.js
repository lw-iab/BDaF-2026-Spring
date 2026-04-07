// DEX test suite
//
// Prerequisites – the contract must be fixed before these tests can run:
//   1. Replace `float` with `uint256` for the rate `r`.
//   2. Accept tokenA/tokenB addresses in the constructor:
//        constructor(address _tokenA, address _tokenB, uint256 _r)
//      and assign  vaultA = IERC20(_tokenA);  vaultB = IERC20(_tokenB);
//   3. Remove `contract DEX is IERC20` (DEX should NOT implement IERC20 itself),
//      or implement all IERC20 methods.
//   4. Define `amountInAfterFee` inside swap() before it is used.
//   5. Remove the trailing `;` after each function closing brace `}`.
//   6. Give `withdrawFee()` an implementation body (even an empty one for now).
//
// Rate convention used in tests:
//   RATE = 2n  →  1 B = 2 A  (amountOut = amountIn / RATE for A→B)
//                             (amountOut = amountIn * RATE for B→A)
//
// Fee convention (to be implemented):
//   FEE_BPS = 10n, FEE_DENOMINATOR = 10_000n  →  0.10 % fee on amountIn
//   amountInAfterFee = amountIn - amountIn * FEE_BPS / FEE_DENOMINATOR
//   The fee stays inside the DEX vault and can be withdrawn via withdrawFee().

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseEther, getAddress, formatEther } from "viem";
import { network } from "hardhat";

describe("DEX", async function () {
  const { viem } = await network.connect();

  const RATE = 2n;
  const FEE_BPS = 10n;
  const FEE_DENOMINATOR = 10_000n;

  // ─── fixture ────────────────────────────────────────────────────────────────

  async function deployFixture() {
    const [owner, alice, bob] = await viem.getWalletClients();

    const tokenA = await viem.deployContract("MockERC20", ["Token A", "TKA"]);
    const tokenB = await viem.deployContract("MockERC20", ["Token B", "TKB"]);

    // Constructor: DEX(address tokenA, address tokenB, uint256 r, address feeRecipient)
    const dex = await viem.deployContract("DEX", [
      tokenA.address,
      tokenB.address,
      RATE,
      owner.account.address,
    ]);

    const supply = parseEther("1000000");
    for (const acct of [owner, alice, bob]) {
      await tokenA.write.mint([acct.account.address, supply]);
      await tokenB.write.mint([acct.account.address, supply]);
    }

    return { tokenA, tokenB, dex, owner, alice, bob };
  }

  // Seed the DEX with initial liquidity from owner.
  async function seedLiquidity(tokenA, tokenB, dex, owner, amountA, amountB) {
    await tokenA.write.approve([dex.address, amountA], { account: owner.account });
    await tokenB.write.approve([dex.address, amountB], { account: owner.account });
    await dex.write.addLiquidity([amountA, amountB], { account: owner.account });
  }

  // ─── addLiquidity ────────────────────────────────────────────────────────────

  it("addLiquidity deposits both tokens and updates reserves", async function () {
    const { tokenA, tokenB, dex, owner } = await deployFixture();

    const amountA = parseEther("1000");
    const amountB = parseEther("500");
    await seedLiquidity(tokenA, tokenB, dex, owner, amountA, amountB);

    const [reserveA, reserveB] = await dex.read.getReserves();
    assert.equal(reserveA, amountA);
    assert.equal(reserveB, amountB);
  });

  it("addLiquidity accumulates correctly across multiple providers", async function () {
    const { tokenA, tokenB, dex, owner, alice } = await deployFixture();

    const amountA = parseEther("1000");
    const amountB = parseEther("500");
    await seedLiquidity(tokenA, tokenB, dex, owner, amountA, amountB);

    await tokenA.write.approve([dex.address, amountA], { account: alice.account });
    await tokenB.write.approve([dex.address, amountB], { account: alice.account });
    await dex.write.addLiquidity([amountA, amountB], { account: alice.account });

    const [reserveA, reserveB] = await dex.read.getReserves();
    assert.equal(reserveA, amountA * 2n);
    assert.equal(reserveB, amountB * 2n);
  });

  it("addLiquidity reverts when token transfer is not approved", async function () {
    const { dex, alice } = await deployFixture();

    await assert.rejects(
      dex.write.addLiquidity([parseEther("100"), parseEther("100")], {
        account: alice.account,
      }),
    );
  });

  // ─── swap ────────────────────────────────────────────────────────────────────

  it("swap tokenA → tokenB gives amountIn * rate output", async function () {
    const { tokenA, tokenB, dex, owner, alice } = await deployFixture();

    await seedLiquidity(tokenA, tokenB, dex, owner, parseEther("10000"), parseEther("10000"));

    const amountIn = parseEther("100");
    const fee = (amountIn * FEE_BPS) / FEE_DENOMINATOR;
    const expectedOut = (amountIn - fee) / RATE; // fee-on-input, then A→B divides by r

    await tokenA.write.approve([dex.address, amountIn], { account: alice.account });
    const balBefore = await tokenB.read.balanceOf([alice.account.address]);
    await dex.write.swap([tokenA.address, amountIn], { account: alice.account });
    const balAfter = await tokenB.read.balanceOf([alice.account.address]);

    assert.equal(balAfter - balBefore, expectedOut);
  });

  it("swap tokenB → tokenA gives amountIn / rate output", async function () {
    const { tokenA, tokenB, dex, owner, bob } = await deployFixture();

    await seedLiquidity(tokenA, tokenB, dex, owner, parseEther("10000"), parseEther("10000"));

    const amountIn = parseEther("100");
    const fee = (amountIn * FEE_BPS) / FEE_DENOMINATOR;
    const expectedOut = (amountIn - fee) * RATE; // fee-on-input, then B→A multiplies by r

    await tokenB.write.approve([dex.address, amountIn], { account: bob.account });
    const balBefore = await tokenA.read.balanceOf([bob.account.address]);
    await dex.write.swap([tokenB.address, amountIn], { account: bob.account });
    const balAfter = await tokenA.read.balanceOf([bob.account.address]);

    assert.equal(balAfter - balBefore, expectedOut);
  });

  it("swap reverts when amountIn is zero", async function () {
    const { tokenA, tokenB, dex, owner, alice } = await deployFixture();

    await seedLiquidity(tokenA, tokenB, dex, owner, parseEther("10000"), parseEther("10000"));

    await assert.rejects(
      dex.write.swap([tokenA.address, 0n], { account: alice.account }),
      /Amount must be > 0/,
    );
  });

  it("swap reverts for an unrecognised token address", async function () {
    const { tokenA, tokenB, dex, owner, alice } = await deployFixture();

    await seedLiquidity(tokenA, tokenB, dex, owner, parseEther("10000"), parseEther("10000"));

    const bogus = "0x0000000000000000000000000000000000000001";
    await assert.rejects(
      dex.write.swap([bogus, parseEther("100")], { account: alice.account }),
      /Invalid token/,
    );
  });

  it("swap reverts when DEX has insufficient output token liquidity", async function () {
    const { tokenA, tokenB, dex, owner, alice } = await deployFixture();

    // Only 1 tokenB in the pool; a swap of 100 tokenA would yield 50 tokenB but only 1 available (RATE=2, A→B divides)
    await tokenA.write.approve([dex.address, parseEther("10000")], { account: owner.account });
    await tokenB.write.approve([dex.address, parseEther("1")], { account: owner.account });
    await dex.write.addLiquidity([parseEther("10000"), parseEther("1")], { account: owner.account });

    const amountIn = parseEther("100");
    await tokenA.write.approve([dex.address, amountIn], { account: alice.account });
    
    await assert.rejects(
      dex.write.swap([tokenA.address, amountIn], { account: alice.account }),
    );
  });

  // ─── getReserves ─────────────────────────────────────────────────────────────

  it("getReserves reflects balances after a swap", async function () {
    const { tokenA, tokenB, dex, owner, alice } = await deployFixture();

    const liquidityA = parseEther("10000");
    const liquidityB = parseEther("10000");
    await seedLiquidity(tokenA, tokenB, dex, owner, liquidityA, liquidityB);

    const amountIn = parseEther("100");
    const fee = (amountIn * FEE_BPS) / FEE_DENOMINATOR;
    const expectedOut = (amountIn - fee) / RATE;
    await tokenA.write.approve([dex.address, amountIn], { account: alice.account });
    await dex.write.swap([tokenA.address, amountIn], { account: alice.account });

    const [reserveA, reserveB] = await dex.read.getReserves();
    assert.equal(reserveA, liquidityA + (amountIn - fee)); // getReserves excludes accumulated fee
    assert.equal(reserveB, liquidityB - expectedOut);
  });

  // ─── feeRecipient ────────────────────────────────────────────────────────────

  it("feeRecipient returns the configured fee recipient", async function () {
    const { dex, owner } = await deployFixture();

    const recipient = await dex.read.feeRecipient();
    assert.equal(getAddress(recipient), getAddress(owner.account.address));
  });

  // ─── fee section (implement FEE_BPS / FEE_DENOMINATOR / withdrawFee first) ──
  //
  // Uncomment and update these tests once the fee logic is live.

  it("swap deducts 0.10 % fee and only the net amount counts toward output", async function () {
    const { tokenA, tokenB, dex, owner, alice } = await deployFixture();

    const liquidityA = parseEther("10000");
    const liquidityB = parseEther("10000");
    await seedLiquidity(tokenA, tokenB, dex, owner, liquidityA, liquidityB);

    const amountIn = parseEther("1000");
    const fee = (amountIn * FEE_BPS) / FEE_DENOMINATOR; // 1 tokenA
    const amountInAfterFee = amountIn - fee; // 999 tokenA
    const expectedOut = amountInAfterFee / RATE; // 499.5 tokenB (A→B divides by r)

    await tokenA.write.approve([dex.address, amountIn], { account: alice.account });
    const balBefore = await tokenB.read.balanceOf([alice.account.address]);
    await dex.write.swap([tokenA.address, amountIn], { account: alice.account });
    const balAfter = await tokenB.read.balanceOf([alice.account.address]);

    assert.equal(balAfter - balBefore, expectedOut);

    // getReserves excludes accumulated fee from pool reserves
    const [reserveA, reserveB] = await dex.read.getReserves();
    assert.equal(reserveA, liquidityA + amountInAfterFee);
    assert.equal(reserveB, liquidityB - expectedOut);
  });

  it("fees accumulate across multiple swaps", async function () {
    const { tokenA, tokenB, dex, owner, alice, bob } = await deployFixture();

    await seedLiquidity(tokenA, tokenB, dex, owner, parseEther("100000"), parseEther("100000"));

    const swaps = [
      { token: tokenA, account: alice.account, amountIn: parseEther("1000") },
      { token: tokenB, account: bob.account, amountIn: parseEther("500") },
      { token: tokenA, account: alice.account, amountIn: parseEther("200") },
    ];

    let totalFeeA = 0n;
    let totalFeeB = 0n;

    for (const s of swaps) {
      await s.token.write.approve([dex.address, s.amountIn], { account: s.account });
      await dex.write.swap([s.token.address, s.amountIn], { account: s.account });
      const fee = (s.amountIn * FEE_BPS) / FEE_DENOMINATOR;
      if (s.token.address === tokenA.address) totalFeeA += fee;
      else totalFeeB += fee;
    }

    // Replace with the actual accumulated-fee read once the contract exposes it:
    // assert.equal(await dex.read.accumulatedFees([tokenA.address]), totalFeeA);
    // assert.equal(await dex.read.accumulatedFees([tokenB.address]), totalFeeB);
    assert.ok(totalFeeA > 0n, "expected non-zero tokenA fees");
    assert.ok(totalFeeB > 0n, "expected non-zero tokenB fees");
  });

  it("withdrawFee transfers accumulated fees to feeRecipient", async function () {
    const { tokenA, tokenB, dex, owner, alice } = await deployFixture();

    await seedLiquidity(tokenA, tokenB, dex, owner, parseEther("10000"), parseEther("10000"));

    const amountIn = parseEther("1000");
    await tokenA.write.approve([dex.address, amountIn], { account: alice.account });
    await dex.write.swap([tokenA.address, amountIn], { account: alice.account });

    const recipient = await dex.read.feeRecipient();
    const balBefore = await tokenA.read.balanceOf([recipient]);
    const fee = (amountIn * FEE_BPS) / FEE_DENOMINATOR;

    await dex.write.withdrawFee({ account: owner.account });

    const balAfter = await tokenA.read.balanceOf([recipient]);
    assert.equal(balAfter - balBefore, fee);
  });

  it("withdrawFee reverts when called by a non-owner", async function () {
    const { dex, alice } = await deployFixture();

    await assert.rejects(
      dex.write.withdrawFee({ account: alice.account }),
      /Only fee recipient can withdraw fees/,
    );
  });
});
