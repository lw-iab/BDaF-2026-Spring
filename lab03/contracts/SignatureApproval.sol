// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

contract SignatureApproval is ERC20 {

    mapping(address => uint256) public nonces;

    constructor() ERC20("Signature Approval Token", "SAT") {
        _mint(msg.sender, 100_000_000 * 10 ** decimals());
    }

    function permit(
        address owner,
        address spender,
        uint256 value,
        uint256 nonce,
        uint256 deadline,
        bytes memory signature
    ) public {
        bytes32 hash = keccak256(
            abi.encodePacked(
                owner,
                spender,
                value,
                nonce,
                deadline,
                address(this)
            )
        );
        bytes32 message = MessageHashUtils.toEthSignedMessageHash(hash);
        address signer = ECDSA.recover(message, signature);

        // check signature validity
        require(block.timestamp <= deadline, "Signature expired");
        require(nonce == nonces[owner], "Invalid nonce");
        require(signer == owner, "Invalid signature");

        // successful approval
        nonces[owner] += 1;
        _approve(owner, spender, value);
    }
}