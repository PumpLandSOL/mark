// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
/// Test-only 6-decimal stable for local anvil runs. Not deployed on Robinhood Chain (real USDG is 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168).
contract MockUSDG {
    string public name = "USDG"; string public symbol = "USDG"; uint8 public decimals = 6;
    mapping(address => uint256) public balanceOf; mapping(address => mapping(address => uint256)) public allowance;
    function mint(address to, uint256 a) external { balanceOf[to] += a; }
    function approve(address s, uint256 a) external returns (bool) { allowance[msg.sender][s] = a; return true; }
    function transfer(address to, uint256 a) external returns (bool) { balanceOf[msg.sender] -= a; balanceOf[to] += a; return true; }
    function transferFrom(address f, address to, uint256 a) external returns (bool) { allowance[f][msg.sender] -= a; balanceOf[f] -= a; balanceOf[to] += a; return true; }
}
