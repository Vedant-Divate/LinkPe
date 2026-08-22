const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LinkPeEscrow", function () {
  const amount = ethers.parseUnits("100", 18);
  const escrowId = "escrow-test-1";
  let escrow;
  let mockUsdc;
  let freelancer;
  let client;

  beforeEach(async function () {
    [freelancer, client] = await ethers.getSigners();

    const MockToken = await ethers.getContractFactory("MockERC20");
    mockUsdc = await MockToken.deploy("Mock USDC", "USDC", 18);
    await mockUsdc.waitForDeployment();

    const Escrow = await ethers.getContractFactory("LinkPeEscrow");
    escrow = await Escrow.deploy(await mockUsdc.getAddress());
    await escrow.waitForDeployment();

    await mockUsdc.mint(client.address, amount);
    await mockUsdc.connect(client).approve(await escrow.getAddress(), amount);
  });

  async function fundEscrow() {
    await escrow.connect(client).createAndFundEscrow(
      escrowId,
      freelancer.address,
      amount,
    );
  }

  it("creates and funds an escrow with USDC", async function () {
    await fundEscrow();

    expect(await escrow.getEscrowClient(escrowId)).to.equal(client.address);
    expect(await escrow.getEscrowAmount(escrowId)).to.equal(amount);
    expect(await escrow.getEscrowState(escrowId)).to.equal(1);
    expect(await mockUsdc.balanceOf(await escrow.getAddress())).to.equal(amount);
  });

  it("submits work and releases funds after client approval", async function () {
    await fundEscrow();

    await escrow.connect(freelancer).submitWork(escrowId, "QmTestHash");
    expect(await escrow.getEscrowState(escrowId)).to.equal(2);
    expect(await escrow.getEscrowIpfsHash(escrowId)).to.equal("QmTestHash");

    await escrow.connect(client).releaseFunds(escrowId);

    expect(await escrow.getEscrowState(escrowId)).to.equal(3);
    expect(await mockUsdc.balanceOf(freelancer.address)).to.equal(amount);
  });

  it("settles a disputed escrow using a proposed split", async function () {
    await fundEscrow();

    await escrow.connect(freelancer).submitWork(escrowId, "QmDisputedHash");
    await escrow.connect(client).rejectWork(escrowId);
    await escrow.connect(freelancer).proposeSplit(escrowId, 60);
    await escrow.connect(client).acceptSplit(escrowId);

    expect(await escrow.getEscrowState(escrowId)).to.equal(3);
    expect(await mockUsdc.balanceOf(freelancer.address)).to.equal(ethers.parseUnits("60", 18));
    expect(await mockUsdc.balanceOf(client.address)).to.equal(ethers.parseUnits("40", 18));
  });
});