const { ethers } = require("hardhat");

async function main() {
  console.log("Deploying Mock USDC...");
  const MockToken = await ethers.getContractFactory("MockERC20");
  const mockUsdc = await MockToken.deploy("Mock USDC", "USDC", 18);
  await mockUsdc.waitForDeployment();
  const usdcAddress = await mockUsdc.getAddress();
  console.log("Mock USDC deployed to:", usdcAddress);

  console.log("Deploying LinkPeEscrow...");
  const Escrow = await ethers.getContractFactory("LinkPeEscrow");
  const escrow = await Escrow.deploy(usdcAddress);
  await escrow.waitForDeployment();

  console.log("=========================================");
  console.log("LinkPeEscrow deployed to:", await escrow.getAddress());
  console.log("=========================================");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });