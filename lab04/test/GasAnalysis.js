import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getAddress } from "viem";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import { network } from "hardhat";
import { count, addresses } from "../members.json";
import fs from "fs";

describe("GasAnalysis", async function () {
    const { viem } = await network.connect();
    const [, nonOwner] = await viem.getWalletClients();

    const batchSize = 500;
    const mappedAddresses = addresses.map((address) => getAddress(address));

    const singleBoard = await viem.deployContract("MembershipBoard");
    const batchBoard = await viem.deployContract("MembershipBoard");
    const merkleBoard = await viem.deployContract("MembershipBoard");

    let merkleTree;
    let root;

    try {
        merkleTree = StandardMerkleTree.load(
            JSON.parse(fs.readFileSync("merkleRoot.json", "utf-8")).tree
        );
        root = merkleTree.root;
    } catch (error) {
        console.error("Error loading Merkle root from file:", error);
        console.log("Generating Merkle tree and root from members list...");
        const values = mappedAddresses.map((address) => [address]);
        merkleTree = StandardMerkleTree.of(values, ["address"]);
        root = merkleTree.root;
    }

    describe("Adding Members one by one", async function () {
        it("Adding Members one by one", async function () {
            for (const address of mappedAddresses) {
                await singleBoard.write.addMember([address]);
            }

            assert.equal(await singleBoard.read.verifyMemberByMapping([mappedAddresses[0]]), true);
            assert.equal(await singleBoard.read.verifyMemberByMapping([mappedAddresses[count - 1]]), true);
        });

        it("Revert when adding duplicate member", async function () {
            await assert.rejects(
                singleBoard.write.addMember([mappedAddresses[0]]),
                /Already a member/
            );
        });

        it("Revert when adding address by non-owner", async function () {
            await viem.assertions.revertWithCustomError(
                singleBoard.write.addMember([mappedAddresses[0]], { account: nonOwner.account }),
                singleBoard,
                "OwnableUnauthorizedAccount",
                [nonOwner.account.address]
            );
        });
    });

    describe("Adding Members in batch", async function () {
        it("Adding Members in batch", async function () {
            for (let i = 0; i < count; i += batchSize) {
                const batch = mappedAddresses.slice(i, i + batchSize);
                await batchBoard.write.batchAddMembers([batch]);
            }

            assert.equal(await batchBoard.read.verifyMemberByMapping([mappedAddresses[0]]), true);
            assert.equal(await batchBoard.read.verifyMemberByMapping([mappedAddresses[count - 1]]), true);
        });

        it("Revert when adding duplicate member in batch", async function () {
            const batch = mappedAddresses.slice(0, batchSize);
            await assert.rejects(
                batchBoard.write.batchAddMembers([batch]),
                /Already a member/
            );
        });

        it("Revert when adding address in batch by non-owner", async function () {
            const batch = mappedAddresses.slice(0, batchSize);
            await viem.assertions.revertWithCustomError(
                batchBoard.write.batchAddMembers([batch], { account: nonOwner.account }),
                batchBoard,
                "OwnableUnauthorizedAccount",
                [nonOwner.account.address]
            );
        });
    });

    describe("Adding Members by setting merkle root", async function () {
        it("Adding Members by setting merkle root", async function () {
            await merkleBoard.write.setMerkleRoot([root]);
            assert.equal(await merkleBoard.read.merkleRoot(), root);
        });

        it("Revert when setting merkle root by non-owner", async function () {
            await viem.assertions.revertWithCustomError(
                merkleBoard.write.setMerkleRoot([root], { account: nonOwner.account }),
                merkleBoard,
                "OwnableUnauthorizedAccount",
                [nonOwner.account.address]
            );
        });
    });

    describe("Verification (Mapping)", async function () {
        it("Returns true for a registered member", async function () {
            const isMember = await batchBoard.read.verifyMemberByMapping([mappedAddresses[0]]);
            assert.equal(isMember, true, `Address ${mappedAddresses[0]} should be a member`);
        });

        it("Returns false for a non-member", async function () {
            const nonMemberAddress = "0x0000000000000000000000000000000000000001";
            const isMember = await batchBoard.read.verifyMemberByMapping([nonMemberAddress]);
            assert.equal(isMember, false, `Address ${nonMemberAddress} should not be a member`);
        });
    });

    describe("Verifying via merkle proof", async function () {
        it("Verifying via merkle proof", async function () {
            for (const address of mappedAddresses) {
                const proof = merkleTree.getProof(mappedAddresses.indexOf(address));
                const isMember = await merkleBoard.read.verifyMemberByProof([address, proof]);
                assert.equal(isMember, true, `Address ${address} should be a member`);
            }
        });

        it("Returns false when verifying non-member via merkle proof", async function () {
            const nonMemberAddress = "0x0000000000000000000000000000000000000001";
            const proof = merkleTree.getProof(0);
            const isMember = await merkleBoard.read.verifyMemberByProof([nonMemberAddress, proof]);
            assert.equal(isMember, false, `Address ${nonMemberAddress} should not be a member`);
        });

        it("Returns false when verifying with invalid proof", async function () {
            const address = mappedAddresses[0];
            const invalidProof = merkleTree.getProof(1);
            const isMember = await merkleBoard.read.verifyMemberByProof([address, invalidProof]);
            assert.equal(isMember, false, `Address ${address} should not be verified with invalid proof`);
        });
    });
});