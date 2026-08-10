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
app.listen(PORT, () => {
  console.log(`LinkPe Backend running on http://localhost:${PORT}`);
});