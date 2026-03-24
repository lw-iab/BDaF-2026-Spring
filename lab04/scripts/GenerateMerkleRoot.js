import { count, addresses } from "../members.json";
import { StandardMerkleTree } from "@openzeppelin/merkle-tree";
import fs from "fs";

// Generate the Merkle tree and root from the members list
const values = addresses.map((address) => [address]);
const merkleTree = StandardMerkleTree.of(values, ["address"]);

// Export the Merkle root to a JSON file
const output = {
    root: merkleTree.root,
    tree: merkleTree.dump(),
};
fs.writeFileSync("merkleRoot.json", JSON.stringify(output, null, 2));
console.log("Merkle root generated and saved to merkleRoot.json");