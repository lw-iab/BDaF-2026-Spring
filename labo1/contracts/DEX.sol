// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract DEX {

    IERC20 public vaultA;
    IERC20 public vaultB;
    uint256 private r = 1;
    uint256 private k = 0;

    uint256 private FEE_BPS = 10;
    uint256 private FEE_DENOMINATOR = 10000;
    uint256 public accFeeA;
    uint256 public accFeeB;
    address public Recipient;

    constructor(
        address _tokenA,
        address _tokenB,
        uint256 _r,
        address _Recipient
    ) {
        vaultA = IERC20(_tokenA);
        vaultB = IERC20(_tokenB);
        r = _r;
        Recipient = _Recipient;
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external {
        vaultA.transferFrom(msg.sender, address(this), amountA);
        vaultB.transferFrom(msg.sender, address(this), amountB);

        // compute k
        k = (vaultA.balanceOf(address(this)) - accFeeA) + r * (vaultB.balanceOf(address(this)) - accFeeB);
    }

    function swap(address tokenIn, uint256 amountIn) external {
        uint256 amountOut;

        require(amountIn > 0, "Amount must be > 0");
        require(tokenIn == address(vaultA) || tokenIn == address(vaultB), "Invalid token");

        // compute fee
        uint256 fee = (amountIn * FEE_BPS) / FEE_DENOMINATOR;
        uint256 amountInAfterFee = amountIn - fee;

        if (tokenIn == address(vaultA)) {
            // swap A for B (rate convention: 1 B = r A)
            amountOut = amountInAfterFee / r;
            require(vaultA.balanceOf(msg.sender) >= amountIn, "Not enough balance");

            // transfer full tokenA input to DEX; track fee separately from pool reserve
            vaultA.transferFrom(msg.sender, address(this), amountIn);
            accFeeA += fee;
            // transfer tokenB from DEX to user
            vaultB.transfer(msg.sender, amountOut);

        } else if (tokenIn == address(vaultB)) {
            // swap B for A (rate convention: 1 B = r A)
            amountOut = amountInAfterFee * r;
            require(vaultB.balanceOf(msg.sender) >= amountIn, "Not enough balance");

            // transfer full tokenB input to DEX; track fee separately from pool reserve
            vaultB.transferFrom(msg.sender, address(this), amountIn);
            accFeeB += fee;
            // transfer tokenA from DEX to user
            vaultA.transfer(msg.sender, amountOut);
        }
        // update k
        k = (vaultA.balanceOf(address(this)) - accFeeA) + r * (vaultB.balanceOf(address(this)) - accFeeB);
    }
    function getReserves() external view returns (uint256 reserveA, uint256 reserveB) {
        reserveA = vaultA.balanceOf(address(this)) - accFeeA;
        reserveB = vaultB.balanceOf(address(this)) - accFeeB;
        return (reserveA, reserveB);
    }
    function feeRecipient() external view returns (address) {
        return Recipient;
    }
    function withdrawFee() external {
        require(msg.sender == Recipient, "Only fee recipient can withdraw fees");
        uint256 feeBalanceA = accFeeA;
        uint256 feeBalanceB = accFeeB;

        if (feeBalanceA > 0) {
            accFeeA = 0;
            vaultA.transfer(Recipient, feeBalanceA);
        }
        if (feeBalanceB > 0) {
            accFeeB = 0;
            vaultB.transfer(Recipient, feeBalanceB);
        }
    }
}