"use client";
import { useState } from "react";
import { useAccount, useWriteContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { escrowABI } from "@/lib/abi";
import { encryptAndUploadFile } from "@/lib/ipfs";
import EthCrypto from "eth-crypto";

export default function Home() {
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  
  // New state for file upload
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState("");

  const generateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLink("");

    try {
      const response = await fetch("http://localhost:3001/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freelancerAddress: address,
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

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return alert("Please select a file first.");
    
    setSubmitting(true);
    setTxStatus("Encrypting file & uploading to IPFS...");

    try {
      // 1. Generate a temporary client public key for this MVP demo
      // In production, this would be the client's actual derived Ethereum public key
      const demoClientIdentity = EthCrypto.createIdentity();
      const clientPublicKey = demoClientIdentity.publicKey;

      // 2. Encrypt file and upload to IPFS
      const ipfsHash = await encryptAndUploadFile(file, clientPublicKey);
      
      setTxStatus("Awaiting MetaMask/Rabby signature to submit work...");
      
      // 3. Call the smart contract to submit the IPFS hash
      await writeContractAsync({
        address: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512", // Escrow Address
        abi: escrowABI,
        functionName: "submitWork",
        args: [ipfsHash],
      });

      setTxStatus("Success! Work submitted. 7-day timer started.");
    } catch (error) {
      console.error(error);
      setTxStatus("Transaction failed or rejected.");
    } finally {
      setSubmitting(false);
    }
  };

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

      <form onSubmit={generateLink} className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg mb-8">
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
        <div className="mt-4 p-4 bg-green-900/50 border border-green-500 rounded-lg max-w-md w-full text-center mb-8">
          <p className="text-green-400 font-bold mb-2">Link Generated!</p>
          <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">
            {link}
          </a>
        </div>
      )}

      {/* New Section: Submit Work for the active escrow */}
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg">
        <h2 className="text-xl font-bold mb-4">Submit Work (Active Escrow)</h2>
        <p className="text-sm text-gray-400 mb-4">Upload the deliverable for the currently funded escrow. File will be encrypted before IPFS upload.</p>
        
        <form onSubmit={handleFileSubmit}>
          <input 
            type="file" 
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="w-full mb-4 text-sm text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            required
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
          >
            {submitting ? "Processing..." : "Encrypt & Submit Work"}
          </button>
          {txStatus && <p className="text-center text-sm text-gray-300 mt-4">{txStatus}</p>}
        </form>
      </div>
    </main>
  );
}
