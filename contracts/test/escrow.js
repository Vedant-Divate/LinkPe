const { expect } = require("chai");
const { ethers } = require("hardhat");

// A simple mock ERC20 token for testing
const MockTokenABI = [
  "function mint(address to, uint256 amount) public",
  "function approve(address spender, uint256 amount) public returns bool"
];

describe("LinkPeEscrow", function () {
  let escrow, mockUsdc;
  let freelancer, client;

  before(async function () {
    [freelancer, client] = await ethers.getSigners();

    // Deploy a Mock USDC Token
    const MockToken = await ethers.getContractFactory("MockERC20");
    mockUsdc = await MockToken.deploy("Mock USDC", "USDC", 18);
    await mockUsdc.waitForDeployment();

    // Deploy the Escrow Contract
    const Escrow = await ethers.getContractFactory("LinkPeEscrow");
    escrow = await Escrow.deploy(await mockUsdc.getAddress());
    await escrow.waitForDeployment();
  });

  it("Should create escrow", async function () {
    await escrow.createEscrow(ethers.parseUnits("100", 18));
    expect((await escrow.currentEscrow()).amount).to.equal(ethers.parseUnits("100", 18));
  });

  it("Should fund escrow dynamically", async function () {
    // Client mints 100 USDC and approves the escrow contract
    await mockUsdc.mint(client.address, ethers.parseUnits("100", 18));
    await mockUsdc.connect(client).approve(escrow.getAddress(), ethers.parseUnits("100", 18));

    // Client funds the escrow
    await escrow.connect(client).fundEscrow();
    expect((await escrow.currentEscrow()).client).to.equal(client.address);
  });

  it("Should submit work and auto-release after time lock", async function () {
    // Freelancer submits work
    await escrow.connect(freelancer).submitWork("QmTestHash");
    
    // Fast forward time by 121 seconds (Time lock is 120 seconds)
    await ethers.provider.send("evm_increaseTime", [121]);
    await ethers.provider.send("evm_mine", []);

    // Freelancer auto-releases funds
    await escrow.connect(freelancer).autoReleaseFunds();
    
    // Check freelancer got the 100 USDC
    const bal = await mockUsdc.balanceOf(freelancer.address);
    expect(bal).to.equal(ethers.parseUnits("100", 18));
  });
}); 