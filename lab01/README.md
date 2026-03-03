# BDaF 2026 Spring Lab1

## Project Overview

This project implements an `EthVault` smart contract for Lab01 using Hardhat.

Current implementation includes:

- A payable `receive()` function so the contract can accept plain ETH transfers.
- A `Deposit` event emitted for every successful ETH deposit.
- A single immutable `owner` set at deployment time.
- A `withdraw(uint256 amount)` function that:
	- allows only the owner to transfer ETH out,
	- reverts on overdrawing,
	- emits a withdrawal event on successful owner withdrawals,
	- emits `UnauthorizedWithdrawAttempt` for non-owner calls without transferring funds.
- A Node.js test suite in `test/EthVault.js` covering deposits, owner withdrawal behavior, unauthorized withdrawal handling, and edge cases.

## Usage

### Setup instructions

Follow these steps to set up Node.js and Hardhat.

1. Install Node.js (LTS recommended)
	- Download from: https://nodejs.org/
	- On Windows, run the installer and keep default options.

2. Verify Node.js and npm are installed

```bash
node -v
npm -v
```

3. Install project dependencies

```bash
npm install
```

4. If Hardhat is not installed yet, add it as a dev dependency

```bash
npm install --save-dev hardhat
```

5. Verify Hardhat is available in this project

```bash
npx hardhat --version
```

6. (Optional sanity check) Compile contracts

```bash
npx hardhat compile
```


## Test instructions
Run the full test suite with:

```bash
npx hardhat test
```

## Solidity version
The contract uses:

```solidity
pragma solidity ^0.8.28;
```

## Framework used
- Hardhat (v3)
- Node.js native test runner (`node:test`)
- Viem for contract interactions and assertions
