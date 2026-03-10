// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract P2PTokenTrade is Ownable {
    uint256 public constant FEE_BPS = 10;
    uint256 public constant BPS_DENOMINATOR = 10_000;

    struct Trade {
        address creator;
        address inputToken;
        uint256 inputAmount;
        uint256 outputAmount;
        uint256 expiry;
        bool active;
    }

    IERC20 public tokenA;
    IERC20 public tokenB;
    uint256 public tradeCount;
    mapping(uint256 => Trade) public trades;

    mapping(address => uint256) public accumulatedFees;

    event TradeCreated(
        uint256 indexed id,
        address indexed creator,
        address indexed inputToken,
        uint256 inputAmount,
        uint256 outputTokenAsk,
        uint256 expiry
    );
    event TradeSettled(
        uint256 indexed id,
        address indexed creator,
        address indexed fulfiller,
        address inputToken,
        uint256 grossInputAmount,
        uint256 outputTokenPaid,
        uint256 feeAmount
    );
    event TradeCancelled(uint256 indexed id, address indexed creator);
    event FeeWithdrawn(address indexed token, uint256 amount);

    constructor(address _tokenA, address _tokenB) Ownable(msg.sender) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    function setupTrade(address inputTokenForSale, uint256 inputTokenAmount, uint256 outputTokenAsk, uint256 expiry) external {
        require(inputTokenForSale == address(tokenA) || inputTokenForSale == address(tokenB), "Invalid token");
        require(inputTokenAmount > 0, "Amount must be > 0");
        require(outputTokenAsk > 0, "Ask must be > 0");
        require(expiry > block.timestamp, "Expiry must be in future");

        IERC20(inputTokenForSale).transferFrom(msg.sender, address(this), inputTokenAmount);

        trades[tradeCount] = Trade(msg.sender, inputTokenForSale, inputTokenAmount, outputTokenAsk, expiry, true);
        emit TradeCreated(tradeCount, msg.sender, inputTokenForSale, inputTokenAmount, outputTokenAsk, expiry);
        tradeCount++;
    }

    function settleTrade(uint256 id) external {
        Trade storage trade = trades[id];
        require(trade.active, "Trade not active");
        require(block.timestamp <= trade.expiry, "Trade expired");

        trade.active = false;
        address outputToken = (trade.inputToken == address(tokenA)) ? address(tokenB) : address(tokenA);

        uint256 fee = (trade.inputAmount * FEE_BPS) / BPS_DENOMINATOR;
        uint256 amountToFulfiller = trade.inputAmount - fee;
        accumulatedFees[trade.inputToken] += fee;

        IERC20(outputToken).transferFrom(msg.sender, trade.creator, trade.outputAmount);
        IERC20(trade.inputToken).transfer(msg.sender, amountToFulfiller);

        emit TradeSettled(
            id,
            trade.creator,
            msg.sender,
            trade.inputToken,
            trade.inputAmount,
            trade.outputAmount,
            fee
        );
    }

    function cancelExpiredTrade(uint256 id) external {
        Trade storage trade = trades[id];
        require(trade.active, "Trade not active");
        require(msg.sender == trade.creator, "Only creator");
        require(block.timestamp > trade.expiry, "Trade not expired");

        trade.active = false;
        IERC20(trade.inputToken).transfer(trade.creator, trade.inputAmount);

        emit TradeCancelled(id, trade.creator);
    }

    function withdrawFee() external onlyOwner {
        address tokenAAddress = address(tokenA);
        address tokenBAddress = address(tokenB);

        uint256 tokenAFee = accumulatedFees[tokenAAddress];
        if (tokenAFee > 0) {
            accumulatedFees[tokenAAddress] = 0;
            IERC20(tokenAAddress).transfer(owner(), tokenAFee);
            emit FeeWithdrawn(tokenAAddress, tokenAFee);
        }

        uint256 tokenBFee = accumulatedFees[tokenBAddress];
        if (tokenBFee > 0) {
            accumulatedFees[tokenBAddress] = 0;
            IERC20(tokenBAddress).transfer(owner(), tokenBFee);
            emit FeeWithdrawn(tokenBAddress, tokenBFee);
        }
    }
}