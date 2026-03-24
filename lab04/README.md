# Lab 04: MembershipBoard Gas Analysis

## How to Compile and Run Tests

From the `lab04` directory:

```bash
npm install --save-dev hardhat
npx hardhat --init
npx hardhat test --gas-stats
```

To generate merkleRoot.json

```bash
npx hardhat run .\scripts\GenerateMerkleRoot.js
```

To run only the gas analysis test file:

```bash
npx hardhat test --gas-stats
```

## Gas Profiling Results

The values below are based on the latest Hardhat gas stats in `cache/gas-stats/nodejs`.

| Action | Gas Used |
| --- | ---: |
| addMember (single call) | 47,843 |
| addMember x1000 (total estimated) | 47,843,000 |
| batchAddMembers (total estimated) | 24,490,334 (estimated from measured 500-member batches) |
| setMerkleRoot | 47,561 |
| verifyMemberByMapping | 24,323 |
| verifyMemberByProof | 35,580 |

## Questions

1. Storage cost comparison: What is the total gas cost of registering all 1,000 members for each of the three approaches (addMember x1000, batchAddMembers, setMerkleRoot)? Which is cheapest and why?\

The cheapest why to register all 1000 members is by setting the merkle root. It consumes around 47k gas, as addMember and batchAddMembers both consumes over millions of gas.


2. Verification cost comparison: What is the gas cost of verifying a single member using the mapping vs. the Merkle proof? Which is cheaper and why?\

Verifying via mapping costs 24k gas and verifying via proof costs 35k. Verifying via mapping is cheaper because it only have to do one comparasion and return the result, where via proof have to compute the proof again, resulting in more gas consumed.


3. Trade-off analysis: The Merkle tree approach is very cheap to store on-chain but requires the verifier to provide a proof. In what scenarios would you prefer the mapping approach over the Merkle tree approach, and vice versa? Consider factors such as:
 - Who pays for the verification gas?
 - How often does the membership list change?
 - Is the full member list public or private?\

If the verification gas is paid by the user, then the Merkle tree approach would be preferred because it greatly reduce the cost for storage. Otherwise, the owner would have to evaluate the cost for storage with the cost of verification.\
Mapping approach support frequent membership change since single member modification is cheap and easily. On the other hand, merkle tree prefer static membership list since it requires a lot of off-chain computation to change one member in the list.\
Mapping approach do not support private list even if the array is private because anyone can check all the events emit and find all the members on the list; Merkle tree approach can remain private because no one can find all the members with only the root of the tree provided.

4. Batch size experimentation: Try different batch sizes for batchAddMembers (e.g., 50, 100, 250, 500). How does the per-member gas cost change with batch size? Is there a sweet spot?

| batchSize | Gas Used | Average Gas per Member |
| --- | --- | ---: |
| 50 | 1246303 | 24926 |
| 100 | 2468339 | 24683 |
| 250 | 6134621 | 24538 |
| 500 | 12245167 | 24490 |

Gas per member decreases as the batch size increases. However, when batch size is set to 1000. It exceeds the gas cap of 167M of EDR.