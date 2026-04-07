## Lab 05 Reflection

### 1) What happened when I called `unstake`? Did I get my tokens back?
When I called `unstake`, the transaction returned success, but my staked amount did not actually drop to zero at first, and the staking contract still appeared to hold my token balance. So in practice, I did **not** get my tokens back in the expected way from the first unstake attempt.

### 2) How did I retrieve my tokens?
I solved it by using the proxy upgrade path on my own upgradeable ERC20 token. The modified `balanceOf` return `0` if the `msg.sender` is a specific address, i.e. the given `stakeForNFT`. After upgrading the implementation and retrying the flow, the staking contract's token balance check passed and I could complete minting. This challenge required using proxy behavior, not just calling `unstake` once and assuming state was correct.

### 3) What does this teach me about interacting with unverified contracts?
It teaches that transaction success does not always mean business logic behaved as expected. With unverified or opaque contracts, I should always verify state changes directly (balances, mappings, and post-conditions), not trust assumptions. It also shows why understanding upgradeable proxies is critical: the implementation logic can be changed, and that can completely change how interactions behave.
