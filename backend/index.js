const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

// API Route: Create a new Escrow Link (Freelancer step)
app.post("/api/escrow", async (req, res) => {
  const { freelancerAddress, amount, description } = req.body;

  try {
    const newLink = await prisma.escrowLink.create({
      data: {
        freelancerAddress,
        amount,
        description,
      },
    });
    res.status(201).json(newLink);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create escrow link" });
  }
});

// API Route: Get an Escrow Link by ID (Client step)
app.get("/api/escrow/:id", async (req, res) => {
  const { id } = req.params;

  try {
    const link = await prisma.escrowLink.findUnique({
      where: { id },
    });

    if (!link) {
      return res.status(404).json({ error: "Link not found" });
    }

    res.status(200).json(link);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch escrow link" });
  }
});

const PORT = 3001;

// IPFS Proxy Route (Bypasses CORS)
app.get("/api/ipfs/:hash", async (req, res) => {
  try {
    const hash = req.params.hash;
    console.log(`Fetching IPFS hash: ${hash}`);
    
    const gateways = [
      `https://gateway.pinata.cloud/ipfs/${hash}`,
      `https://ipfs.io/ipfs/${hash}`,
      `https://dweb.link/ipfs/${hash}`
    ];

    let response;
    for (let i = 0; i < gateways.length; i++) {
      try {
        console.log(`Trying gateway: ${gateways[i]}`);
        response = await fetch(gateways[i]);
        if (response.ok) {
          console.log("✅ Success on gateway:", gateways[i]);
          break;
        }
      } catch (e) {
        console.log(`Gateway ${gateways[i]} failed`);
      }
    }

    if (!response || !response.ok) {
      return res.status(404).json({ error: "File not found on any IPFS gateway" });
    }

    const data = await response.text();
    res.send(data);
  } catch (error) {
    console.error("IPFS Proxy Error:", error);
    res.status(500).json({ error: "Failed to fetch from IPFS" });
  }
});

// API Route: Get all escrows for a specific freelancer
app.get("/api/escrows/:freelancerAddress", async (req, res) => {
  const { freelancerAddress } = req.params;
  try {
    const links = await prisma.escrowLink.findMany({
      where: { freelancerAddress },
      orderBy: { createdAt: 'desc' }
    });
    res.status(200).json(links);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to fetch escrows" });
  }
});

app.listen(PORT, () => {
  console.log(`LinkPe Backend running on http://localhost:${PORT}`);
});