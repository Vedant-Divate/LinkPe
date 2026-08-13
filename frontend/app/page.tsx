"use client";
import { useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { useAccount } from "wagmi";

export default function Home() {
  const { address, isConnected } = useAccount();
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);

  const generateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLink("");

    try {
      const response = await fetch("http://localhost:3001/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freelancerAddress: address, // Hardhat Account 0
          amount: Number(amount),
          description: description,
        }),
      });

      const data = await response.json();
      if (data.id) {
        setLink(`http://localhost:3000/escrow/${data.id}`);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

    // If wallet is not connected, show this message instead of the form
  if (!isConnected) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-24 bg-gray-900 text-white">
        <div className="absolute top-8 right-8">
          <ConnectButton />
        </div>
        <h1 className="text-4xl font-bold mb-2">LinkPe</h1>
        <p className="mb-8 text-gray-400">Freelancer Dashboard</p>
        <p className="text-yellow-400 text-lg">⚠️ Please connect your wallet to generate an escrow link.</p>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center p-24 bg-gray-900 text-white">
      <div className="absolute top-8 right-8">
        <ConnectButton />
      </div>

      <h1 className="text-4xl font-bold mb-2">LinkPe</h1>
      <p className="mb-8 text-gray-400">Freelancer Dashboard</p>

      <form onSubmit={generateLink} className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg">
        <div className="mb-4">
          <label className="block text-sm font-medium mb-2">Amount (USDC)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="e.g. 500"
            required
          />
        </div>
        <div className="mb-6">
          <label className="block text-sm font-medium mb-2">Milestone Description</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
            placeholder="e.g. Build a landing page"
            required
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
        >
          {loading ? "Generating..." : "Generate Escrow Link"}
        </button>
      </form>

      {link && (
        <div className="mt-8 p-4 bg-green-900/50 border border-green-500 rounded-lg max-w-md w-full text-center">
          <p className="text-green-400 font-bold mb-2">Link Generated!</p>
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">
            {link}
          </a>
        </div>
      )}
    </main>
  );

}