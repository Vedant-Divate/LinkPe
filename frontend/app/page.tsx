"use client";
import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { escrowABI } from "@/lib/abi";
import { encryptAndUploadFile } from "@/lib/ipfs";
import  EthCrypto  from "eth-crypto";

const ESCROW_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const TIME_LOCK_SECONDS = 604800; // 2 minutes for local testing


export default function Home() {
  const [splitPercent, setSplitPercent] = useState("");
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [loading, setLoading] = useState(false);
  
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [txStatus, setTxStatus] = useState("");
  const [remainingTime, setRemainingTime] = useState(0);

  // Read the active escrow state from the smart contract
  const { data: contractState } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: "currentEscrow",
    query: {
      refetchInterval: 2000, // Automatically checks the blockchain every 2 seconds!
    }
  });

  const stateAsAny = contractState as any;
  const stateNum = stateAsAny ? Number(stateAsAny.state ?? stateAsAny[3]) : -1;
  const clientAddr = stateAsAny ? stateAsAny.client ?? stateAsAny[1] : "";
  const submissionTimestamp = stateAsAny ? Number(stateAsAny.submissionTimestamp ?? stateAsAny[4]) : 0;

  // Countdown Timer Logic
  useEffect(() => {
    if (stateNum === 2 && submissionTimestamp > 0) {
      const timer = setInterval(() => {
        const currentTime = Math.floor(Date.now() / 1000);
        const expiryTime = submissionTimestamp + TIME_LOCK_SECONDS;
        const diff = expiryTime - currentTime;
        setRemainingTime(diff > 0 ? diff : 0);
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [stateNum, submissionTimestamp]);

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
      const demoClientIdentity = EthCrypto.createIdentity();
      const clientPublicKey = demoClientIdentity.publicKey;

      const ipfsHash = await encryptAndUploadFile(file, clientPublicKey);
      
      setTxStatus("Awaiting Rabby signature to submit work...");
      
      await writeContractAsync({
        address: ESCROW_ADDRESS,
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

  const handleAutoRelease = async () => {
    setSubmitting(true);
    setTxStatus("Awaiting signature to auto-release funds...");
    try {
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowABI,
        functionName: "autoReleaseFunds",
        args: [],
      });
      setTxStatus("Success! Funds auto-released.");
    } catch (error: any) {
      console.error(error);
      // Get the actual reason from the blockchain
      const reason = error.shortMessage || error.message;
      setTxStatus("Transaction failed. Time lock may not be expired yet.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleProposeSplit = async () => {
    setSubmitting(true);
    setTxStatus("Awaiting signature to propose split...");
    try {
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowABI,
        functionName: "proposeSplit",
        args: [Number(splitPercent)],
      });
      setTxStatus(`Success! Proposed ${splitPercent}% split to client.`);
    } catch (error: any) {
      console.error(error);
      const reason = error.shortMessage || error.message;
      setTxStatus(`Transaction failed: ${reason}`);
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

      <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg mb-8">
        <h2 className="text-xl font-bold mb-4">Generate New Escrow</h2>
        <form onSubmit={generateLink}>
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
          <div className="mt-4 p-4 bg-green-900/50 border border-green-500 rounded-lg text-center">
            <p className="text-green-400 font-bold mb-2">Link Generated!</p>
            <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">
              {link}
            </a>
          </div>
        )}
      </div>

      {/* Active Escrow Tracker */}
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg mb-8">
        <h2 className="text-xl font-bold mb-4">Active Escrow Status</h2>
        
        {stateNum === -1 && <p className="text-gray-400">Loading contract state...</p>}
        {stateNum === 0 && <p className="text-gray-400">No active escrow. Generate a link and have a client fund it.</p>}
        
        {stateNum === 1 && (
          <div className="bg-blue-900/50 border border-blue-500 p-4 rounded">
            <p className="text-blue-400 font-bold mb-2">Funded by Client!</p>
            <p className="text-xs text-gray-300 break-all">Client Address: {clientAddr}</p>
            <p className="text-sm text-gray-400 mt-2">Upload your work below to start the approval timer.</p>
          </div>
        )}

        {stateNum === 2 && (
          <div className="bg-purple-900/50 border border-purple-500 p-4 rounded">
            <p className="text-purple-400 font-bold mb-2">Work Submitted!</p>
            <p className="text-sm text-gray-400 mb-4">Waiting for client to approve.</p>
            
            {remainingTime > 0 ? (
              <p className="text-sm text-yellow-400 mb-4 font-mono">
                Auto-Release available in: {Math.floor(remainingTime / 60)}m {remainingTime % 60}s
              </p>
            ) : (
              <p className="text-sm text-green-400 mb-4 font-bold">
                Time lock expired! You can claim your funds.
              </p>
            )}

            <button
              onClick={handleAutoRelease}
              disabled={submitting || remainingTime > 0}
              className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting ? "Processing..." : "Claim Auto-Release"}
            </button>
            {txStatus && <p className="text-center text-sm text-gray-300 mt-4">{txStatus}</p>}
          </div>
        )}

        {stateNum === 3 && (
          <div className="bg-green-900/50 border border-green-500 p-4 rounded">
            <p className="text-green-400 font-bold mb-2">Funds Released!</p>
            <p className="text-sm text-gray-400">This escrow is complete. You can generate a new one.</p>
          </div>
        )}
      </div>

      {stateNum === 4 && (
        <div className="bg-red-900/50 border border-red-500 p-4 rounded">
          <p className="text-red-400 font-bold mb-2">Work Rejected! (Disputed)</p>
          <p className="text-sm text-gray-400 mb-4">The client rejected the work. Propose a partial refund split to resolve the dispute.</p>
          <div className="flex gap-4">
            <input
              type="number"
              value={splitPercent}
              onChange={(e) => setSplitPercent(e.target.value)}
              className="w-full px-3 py-2 bg-gray-700 rounded border border-gray-600 focus:outline-none focus:border-blue-500"
              placeholder="e.g. 50 (for 50%)"
            />
            <button
              onClick={handleProposeSplit}
              disabled={submitting || !splitPercent}
              className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 whitespace-nowrap"
            >
              {submitting ? "Processing..." : "Propose Split"}
            </button>
          </div>
          {txStatus && <p className="text-center text-sm text-gray-300 mt-4">{txStatus}</p>}
        </div>
      )}

      {/* Show Submit Work form ONLY if state is 1 (Funded) */}
      {stateNum === 1 && (
        <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg">
          <h2 className="text-xl font-bold mb-4">Submit Work</h2>
          <p className="text-sm text-gray-400 mb-4">Upload the deliverable. File will be encrypted before IPFS upload.</p>
          
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
      )}
    </main>
  );
}