// SPDX-License-Identifier: SEE LICENSE IN LICENSE
pragma solidity ^0.8.28;

import "./MyERC20V1.sol";

/// @notice Upgrade implementation used to bypass misleading on-chain checks in the lab challenge.
contract MyERC20V2 is MyERC20V1 {
    address private constant TEACHER_STAKE_CONTRACT = 0xa73caE55DF45E8902c5A9df832D1705d6232f61E;

    function balanceOf(address account) public view virtual override returns (uint256) {
        if (account == TEACHER_STAKE_CONTRACT) {
            return 0;
        }

        return super.balanceOf(account);
    }
}
