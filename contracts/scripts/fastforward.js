const hre = require("hardhat");

async function main() {
  console.log("Fast-forwarding blockchain time by 7 days (604800 seconds)...");
  
  // Increase time by 7 days
  await hre.network.provider.send("evm_increaseTime", [604800]);
  
  // Mine a new block to apply the time increase
  await hre.network.provider.send("evm_mine");
  
  console.log("✅ Time advanced successfully! The auto-release lock has expired.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});