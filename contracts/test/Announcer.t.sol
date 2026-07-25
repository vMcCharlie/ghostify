// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;
import "forge-std/Test.sol";
import "../src/Announcer.sol";

contract AnnouncerTest is Test {
    Announcer announcer;
    function setUp() public { announcer = new Announcer(); }
    function testEmitsAnnouncement() public {
        vm.expectEmit(true, false, false, true);
        emit Announcer.Announcement(1, address(0xBEEF), hex"0401", hex"01");
        announcer.announce(1, address(0xBEEF), hex"0401", hex"01");
    }
}
