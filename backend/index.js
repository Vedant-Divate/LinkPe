require("dotenv").config();

const express = require("express");
const cors = require("cors");
const { PrismaClient } = require("@prisma/client");

const app = express();
const prisma = new PrismaClient();

app.use(cors());
app.use(express.json());

app.get("/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({ status: "ok", database: "connected" });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(503).json({ status: "error", database: "unavailable" });
  }
});

// API Route: Create a new Escrow Link (Freelancer step)
app.post("/api/escrow", async (req, res) => {
  const { freelancerAddress, amount, description } = req.body;

  if (!/^0x[a-fA-F0-9]{40}$/.test(freelancerAddress || "") || !Number.isInteger(amount) || amount <= 0 || amount > 1000000000 || !description?.trim() || description.trim().length > 1000) {
    return res.status(400).json({ error: "freelancerAddress, positive integer amount, and description are required" });
  }

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
    console.error("Create escrow link failed:", error);
    res.status(500).json({
      error: "Failed to create escrow link",
      code: error?.code || "UNKNOWN_ERROR",
    });
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



// IPFS Proxy Route (Bypasses CORS)
app.get("/api/ipfs/:hash", async (req, res) => {
  try {
    const hash = req.params.hash;
    if (!/^(Qm[1-9A-HJ-NP-Za-km-z]{44}|bafy[a-zA-Z0-9]+)$/.test(hash)) {
      return res.status(400).json({ error: "Invalid IPFS content identifier" });
    }
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
    try {
      const payload = JSON.parse(data);
      if (!payload || typeof payload !== "object" || typeof payload.encryptedFile !== "string" || typeof payload.encryptedAesKey !== "string" || typeof payload.fileName !== "string") {
        return res.status(422).json({ error: "IPFS payload is not a valid encrypted work package" });
      }
      res.type("application/json").json(payload);
    } catch (_error) {
      res.status(422).json({ error: "IPFS content is not a JSON work package" });
    }
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

const PORT = process.env.PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`LinkPe Backend running on http://localhost:${PORT}`);
});