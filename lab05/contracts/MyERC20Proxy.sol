// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";

import "./MyERC20V1.sol";

contract MyERC20Proxy {

    MyERC20V1 public token;

    constructor() {
        // Deploy implementation
        MyERC20V1 impl = new MyERC20V1();

        // Deploy proxy with initialization
        bytes memory data = abi.encodeCall(
            MyERC20V1.initialize,
            ("MyToken", "MTK", 1_000_000 * 1e18)
        );

        ERC1967Proxy proxy = new ERC1967Proxy(address(impl), data);

        token = MyERC20V1(address(proxy));

        // Initial supply is minted to this deployer contract during initialize.
        // Forward it to the external deployer wallet so staking uses the sender balance.
        uint256 balance = token.balanceOf(address(this));
        require(token.transfer(msg.sender, balance), "Token transfer failed");
    }

    // Challenge helper: route upgrade through this contract, which is token owner.
    function upgradeToken(address newImplementation, bytes calldata data) external {
        token.upgradeToAndCall(newImplementation, data);
    }

}






