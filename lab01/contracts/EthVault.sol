// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

/// @title EthVault
/// @notice Receives ETH deposits and allows only the owner to withdraw.
contract EthVault {
	/// @notice Single authorized withdrawer set at deployment.
	address public immutable owner;

	/// @notice Emitted whenever ETH is received by the contract.
	event Deposit(address indexed sender, uint256 amount);
	/// @notice Emitted when the owner successfully withdraws ETH.
	event Weethdraw(address indexed to, uint256 amount);
	/// @notice Emitted when a non-owner attempts to withdraw.
	event UnauthorizedWithdrawAttempt(address indexed caller, uint256 amount);

	/// @notice Reverts when requested withdraw amount exceeds available balance.
	error InsufficientBalance(uint256 requested, uint256 available);
	/// @notice Reverts when ETH transfer to owner fails.
	error TransferFailed();

	/// @dev Sets deployer as the immutable owner.
	constructor() {
		owner = msg.sender;
	}

	/// @notice Accepts plain ETH transfers and records each deposit.
	receive() external payable {
		emit Deposit(msg.sender, msg.value);
	}

	/// @notice Withdraws ETH to owner when called by owner; logs unauthorized attempts.
	/// @param amount Amount of ETH (in wei) to withdraw.
	function withdraw(uint256 amount) external {
		// Non-owner calls do not transfer funds.
		if (msg.sender != owner) {
			emit UnauthorizedWithdrawAttempt(msg.sender, amount);
			return;
		}

		// Prevent overdrawing from the vault.
		uint256 currentBalance = address(this).balance;
		if (amount > currentBalance) {
			revert InsufficientBalance(amount, currentBalance);
		}

		// Transfer ETH using call and verify success.
		(bool ok, ) = payable(owner).call{value: amount}("");
		if (!ok) {
			revert TransferFailed();
		}

		// Record successful owner withdrawal.
		emit Weethdraw(owner, amount);
	}
}
