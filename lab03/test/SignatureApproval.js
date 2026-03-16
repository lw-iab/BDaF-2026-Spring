import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encodePacked, getAddress, keccak256, parseEther } from "viem";

import { network } from "hardhat";

describe("SignatureApproval", async function () {
  const { viem } = await network.connect();

  async function deployFixture() {
    const token = await viem.deployContract("SignatureApproval");
    const publicClient = await viem.getPublicClient();
    const [owner, alice, bob] = await viem.getWalletClients();

    const aliceSeed = parseEther("1000");
    await token.write.transfer([alice.account.address, aliceSeed], {
      account: owner.account,
    });

    return { token, publicClient, owner, alice, bob, aliceSeed };
  }

  async function signPermit({ ownerClient, tokenAddress, owner, spender, value, nonce, deadline }) {
    const packed = encodePacked(
      ["address", "address", "uint256", "uint256", "uint256", "address"],
      [owner, spender, value, nonce, deadline, tokenAddress],
    );
    const hash = keccak256(packed);
    const signature = await ownerClient.signMessage({
      account: ownerClient.account,
      message: { raw: hash },
    });

    return signature;
  }

  it("has 100,000,000 total supply and 18 decimals", async function () {
    const { token } = await deployFixture();

    assert.equal(await token.read.decimals(), 18);
    assert.equal(await token.read.totalSupply(), parseEther("100000000"));
  });

  it("valid signature executes permit and updates allowance", async function () {
    const { token, publicClient, alice, bob } = await deployFixture();

    const owner = getAddress(alice.account.address);
    const spender = getAddress(bob.account.address);
    const value = parseEther("25");
    const nonce = await token.read.nonces([owner]);
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 3600n;

    const signature = await signPermit({
      ownerClient: alice,
      tokenAddress: token.address,
      owner,
      spender,
      value,
      nonce,
      deadline,
    });

    await token.write.permit([owner, spender, value, nonce, deadline, signature], {
      account: bob.account,
    });

    assert.equal(await token.read.allowance([owner, spender]), value);
  });

  it("wrong signer fails", async function () {
    const { token, publicClient, alice, bob } = await deployFixture();

    const owner = getAddress(alice.account.address);
    const spender = getAddress(bob.account.address);
    const value = parseEther("10");
    const nonce = await token.read.nonces([owner]);
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 600n;

    const signature = await signPermit({
      ownerClient: bob,
      tokenAddress: token.address,
      owner,
      spender,
      value,
      nonce,
      deadline,
    });

    await assert.rejects(
      token.write.permit([owner, spender, value, nonce, deadline, signature], {
        account: bob.account,
      }),
      /Invalid signature/,
    );
  });

  it("nonce increases after successful permit and replay fails", async function () {
    const { token, publicClient, alice, bob } = await deployFixture();

    const owner = getAddress(alice.account.address);
    const spender = getAddress(bob.account.address);
    const value = parseEther("12");
    const nonce = await token.read.nonces([owner]);
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 1200n;

    const signature = await signPermit({
      ownerClient: alice,
      tokenAddress: token.address,
      owner,
      spender,
      value,
      nonce,
      deadline,
    });

    await token.write.permit([owner, spender, value, nonce, deadline, signature], {
      account: bob.account,
    });

    assert.equal(await token.read.nonces([owner]), nonce + 1n);

    await assert.rejects(
      token.write.permit([owner, spender, value, nonce, deadline, signature], {
        account: bob.account,
      }),
      /Invalid nonce/,
    );
  });

  it("expired signature fails", async function () {
    const { token, publicClient, alice, bob } = await deployFixture();

    const owner = getAddress(alice.account.address);
    const spender = getAddress(bob.account.address);
    const value = parseEther("5");
    const nonce = await token.read.nonces([owner]);
    const block = await publicClient.getBlock();
    const deadline = block.timestamp - 1n;

    const signature = await signPermit({
      ownerClient: alice,
      tokenAddress: token.address,
      owner,
      spender,
      value,
      nonce,
      deadline,
    });

    await assert.rejects(
      token.write.permit([owner, spender, value, nonce, deadline, signature], {
        account: bob.account,
      }),
      /Signature expired/,
    );
  });

  it("transferFrom works after permit", async function () {
    const { token, publicClient, alice, bob } = await deployFixture();

    const owner = getAddress(alice.account.address);
    const spender = getAddress(bob.account.address);
    const value = parseEther("40");
    const moveAmount = parseEther("17");
    const nonce = await token.read.nonces([owner]);
    const block = await publicClient.getBlock();
    const deadline = block.timestamp + 3000n;

    const signature = await signPermit({
      ownerClient: alice,
      tokenAddress: token.address,
      owner,
      spender,
      value,
      nonce,
      deadline,
    });

    await token.write.permit([owner, spender, value, nonce, deadline, signature], {
      account: bob.account,
    });

    const bobBefore = await token.read.balanceOf([spender]);
    await token.write.transferFrom([owner, spender, moveAmount], { account: bob.account });
    const bobAfter = await token.read.balanceOf([spender]);

    assert.equal(bobAfter, bobBefore + moveAmount);
  });

  it("transferFrom fails if permit was not executed", async function () {
    const { token, alice, bob } = await deployFixture();

    const owner = getAddress(alice.account.address);
    const spender = getAddress(bob.account.address);
    const amount = parseEther("1");

    await viem.assertions.revertWithCustomError(
      token.write.transferFrom([owner, spender, amount], { account: bob.account }),
      token,
      "ERC20InsufficientAllowance",
      [spender, 0n, amount],
    );
  });
});
