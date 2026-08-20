const hre = require("hardhat");

async function main() {
  const escrowAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
  const escrowId = process.argv[2];
  
  if (!escrowId) {
    console.log("Please provide an escrow ID:");
    console.log("npx hardhat run scripts/check-escrow.js --network localhost -- <YOUR_UUID>");
    return;
  }

  console.log(`Checking Escrow ID: ${escrowId}`);
  const Escrow = await hre.ethers.getContractFactory("LinkPeEscrow");
  const escrow = await Escrow.attach(escrowAddress);
  
  const data = await escrow.escrows(escrowId);
  console.log("=========================================");
  console.log("Blockchain Data:", data);
  console.log("=========================================");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});