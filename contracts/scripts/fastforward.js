const hre = require("hardhat");

async function main() {
  console.log("Fast-forwarding blockchain time by 130 seconds (2 mins 10 secs)...");
  
  // Increase time
  await hre.network.provider.send("evm_increaseTime", [130]);
  
  // Mine a new block to lock in the new time
  await hre.network.provider.send("evm_mine");
  
  console.log("✅ Time advanced! You can now click 'Claim Auto-Release' on the frontend.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});