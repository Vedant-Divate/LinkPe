"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { escrowABI, usdcABI } from "@/lib/abi";
import { parseUnits } from "viem";

const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ESCROW_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

export default function EscrowPage() {
  const params = useParams();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [escrowData, setEscrowData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");

  const { data: contractState, isFetched } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: "currentEscrow",
    query: {
      refetchInterval: 2000, // Auto-refetch every 2 seconds
    }
  });


 // Cast to any to bypass TypeScript struct strictness, and fallback to array index just in case
  const stateAsAny = contractState as any;
  const stateNum = stateAsAny ? Number(stateAsAny.state ?? stateAsAny[3]) : -1;
  const proposedSplit = stateAsAny ? Number(stateAsAny.proposedSplit ?? stateAsAny[6]) : 0;

  useEffect(() => {
    if (params.id) {
      fetch(`http://localhost:3001/api/escrow/${params.id}`)
        .then(res => res.json())
        .then(data => setEscrowData(data));
    }
  }, [params.id]);

  const handleFund = async () => {
    if (!escrowData) return;
    setLoading(true);
    setStatus("1/2: Approving USDC...");

    try {
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: usdcABI,
        functionName: "approve",
        args: [ESCROW_ADDRESS, parseUnits(escrowData.amount.toString(), 18)],
      });

      setStatus("2/2: Funding Escrow...");
      
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowABI,
        functionName: "createAndFundEscrow",
        args: [escrowData.freelancerAddress, parseUnits(escrowData.amount.toString(), 18)],
      });

      setStatus("Success! Escrow funded.");
    } catch (error) {
      console.error(error);
      setStatus("Transaction failed or rejected.");
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async () => {
    setLoading(true);
    setStatus("Awaiting signature to release funds...");
    try {
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowABI,
        functionName: "releaseFunds",
        args: [],
      });
      setStatus("Success! Funds released to freelancer.");
    } catch (error) {
      console.error(error);
      setStatus("Transaction failed or rejected.");
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setStatus("Awaiting signature to reject work...");
    try {
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowABI,
        functionName: "rejectWork",
        args: [],
      });
      setStatus("Work rejected. Dispute started.");
    } catch (error) {
      console.error(error);
      setStatus("Transaction failed or rejected.");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptSplit = async () => {
    setLoading(true);
    setStatus("Awaiting signature to accept split...");
    try {
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowABI,
        functionName: "acceptSplit",
        args: [],
      });
      setStatus("Success! Split accepted and funds distributed.");
    } catch (error: any) {
      console.error(error);
      const reason = error.shortMessage || error.message;
      setStatus(`Transaction failed: ${reason}`);
    } finally {
      setLoading(false);
    }
  };

  const mintTestUsdc = async () => {
    setLoading(true);
    try {
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: usdcABI,
        functionName: "mint",
        args: [address, parseUnits("1000", 18)],
      });
      alert("Minted 1000 test USDC!");
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center p-24 bg-gray-900 text-white">
      <div className="absolute top-8 right-8">
        <ConnectButton />
      </div>

      <h1 className="text-3xl font-bold mb-8">Pending Escrow Request</h1>

      {/* DEBUG BOX - Let's see what the blockchain says! */}
      <div className="mb-4 p-2 bg-yellow-900 text-yellow-300 rounded text-center text-sm w-full max-w-md">
        DEBUG: Contract State = {stateNum} | Fetched: {isFetched ? "Yes" : "No"}
      </div>

      {!escrowData ? (
        <p>Loading link details...</p>
      ) : (
        <div className="w-full max-w-md bg-gray-800 p-8 rounded-lg shadow-lg">
          <div className="mb-4">
            <p className="text-gray-400 text-sm">Freelancer Address:</p>
            <p className="break-all">{escrowData.freelancerAddress}</p>
          </div>
          <div className="mb-4">
            <p className="text-gray-400 text-sm">Description:</p>
            <p>{escrowData.description}</p>
          </div>
          <div className="mb-6">
            <p className="text-gray-400 text-sm">Amount:</p>
            <p className="text-2xl font-bold text-green-400">{escrowData.amount} USDC</p>
          </div>

          {/* Show Fund button ONLY if State is 0 (Pending) */}
          {stateNum === 0 && (
            <>
              <button
                onClick={handleFund}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50 mb-4"
              >
                {loading ? "Processing..." : "Fund Escrow (Lock USDC)"}
              </button>
              <button
                onClick={mintTestUsdc}
                disabled={loading}
                className="w-full bg-gray-600 hover:bg-gray-700 text-white text-sm py-2 px-4 rounded transition-colors"
              >
                Need test USDC? Click to mint 1000
              </button>
            </>
          )}

          {/* Show Approve/Reject buttons if Submitted (2) */}
          {stateNum === 2 && (
            <div className="mt-4">
              <div className="p-4 bg-purple-900/50 border border-purple-500 rounded-lg mb-6">
                <p className="text-purple-400 font-bold mb-2">Work Submitted!</p>
                <p className="text-xs text-gray-300 break-all">IPFS Hash: Uploaded to IPFS (Encrypted)</p>
                <p className="text-xs text-gray-400 mt-2">The 7-day approval timer has started.</p>
              </div>
              <div className="flex gap-4">
                <button
                  onClick={handleRelease}
                  disabled={loading}
                  className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
                >
                  {loading ? "Processing..." : "Approve & Release"}
                </button>
                <button
                  onClick={handleReject}
                  disabled={loading}
                  className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
                >
                  {loading ? "Processing..." : "Reject Work"}
                </button>
              </div>
            </div>
          )}

          {/* Show Accept Split button if Disputed (4) */}
          {stateNum === 4 && (
            <div className="mt-4">
              <div className="p-4 bg-red-900/50 border border-red-500 rounded-lg mb-6">
                <p className="text-red-400 font-bold mb-2">Work Rejected! (Disputed)</p>
                {proposedSplit > 0 ? (
                  <div className="mt-2 text-sm text-yellow-300">
                    <p>The freelancer is proposing to keep <strong>{proposedSplit}%</strong> of the funds.</p>
                    <p className="text-gray-400 mt-1">If you accept, {100 - proposedSplit}% will be refunded to you.</p>
                  </div>
                ) : (
                  <p className="text-xs text-gray-300 mt-2">Waiting for the freelancer to propose a partial refund split...</p>
                )}
              </div>
                  
              {proposedSplit > 0 && (
                <button
                  onClick={handleAcceptSplit}
                  disabled={loading}
                  className="w-full bg-orange-600 hover:bg-orange-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50"
                >
                  {loading ? "Processing..." : `Accept ${proposedSplit}% Split`}
                </button>
              )}
              {status && <p className="text-center text-sm text-gray-300 mt-4">{status}</p>}
            </div>
          )}

          {/* Show Success message if State is 3 (Released) */}
          {stateNum === 3 && (
            <div className="p-4 bg-green-900/50 border border-green-500 rounded-lg text-center">
              <p className="text-green-400 font-bold">Funds Released!</p>
              <p className="text-sm text-gray-300 mt-2">The freelancer has been paid.</p>
            </div>
          )}

          {status && <p className="text-center text-sm text-gray-300 mt-4">{status}</p>}
        </div>
      )}
    </main>
  );
}