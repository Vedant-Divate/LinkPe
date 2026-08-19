"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { escrowABI, usdcABI } from "@/lib/abi";
import { parseUnits } from "viem";
import EthCrypto from "eth-crypto";
import CryptoJS from "crypto-js";

const USDC_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
const ESCROW_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";

export default function EscrowPage() {
  const params = useParams();
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [escrowData, setEscrowData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState("");
  const [ipfsLoading, setIpfsLoading] = useState(false);
  const [decryptionKey, setDecryptionKey] = useState("");
  const [remainingTime, setRemainingTime] = useState(0);

  const TIME_LOCK_SECONDS = 604800;

  const { data: contractState, isFetched } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: "currentEscrow",
    query: { refetchInterval: 2000 }
  });

  const { data: ipfsHashData } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: "currentIpfsHash",
    query: { refetchInterval: 2000 }
  });

  const stateAsAny = contractState as any;
  const stateNum = stateAsAny ? Number(stateAsAny.state ?? stateAsAny[3]) : -1;
  const proposedSplit = stateAsAny ? Number(stateAsAny.proposedSplit ?? stateAsAny[6]) : 0;
  const ipfsHash = ipfsHashData as string;
  const escrowAmount = stateAsAny ? Number(stateAsAny.amount) / 1e18 : 0;
  const submissionTimestamp = stateAsAny ? Number(stateAsAny.submissionTimestamp ?? stateAsAny[4]) : 0;

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

  useEffect(() => {
    if (params.id) {
      fetch(`http://localhost:3001/api/escrow/${params.id}`)
        .then(res => res.json())
        .then(data => setEscrowData(data));
    }
  }, [params.id]);

  useEffect(() => {
    setStatus("");
    setSummary("");
  }, [stateNum]);

  const handleFund = async () => {
    if (!escrowData) return;
    setLoading(true);
    setStatus("1/2: Approving USDC...");
    try {
      await writeContractAsync({ address: USDC_ADDRESS, abi: usdcABI, functionName: "approve", args: [ESCROW_ADDRESS, parseUnits(escrowData.amount.toString(), 18)] });
      setStatus("2/2: Funding Escrow...");
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "createAndFundEscrow", args: [escrowData.freelancerAddress, parseUnits(escrowData.amount.toString(), 18)] });
      setStatus("Success! Escrow funded.");
      setSummary(`✅ Escrow Funded: You locked ${escrowData.amount} USDC.`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleRelease = async () => {
    setLoading(true);
    setStatus("Awaiting signature to release funds...");
    try {
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "releaseFunds", args: [] });
      setStatus("Success! Funds released to freelancer.");
      setSummary(`✅ Transaction Complete: You released ${escrowAmount} USDC to the freelancer.`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    setLoading(true);
    setStatus("Awaiting signature to reject work...");
    try {
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "rejectWork", args: [] });
      setStatus("Work rejected. Dispute started.");
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptSplit = async () => {
    setLoading(true);
    setStatus("Awaiting signature to accept split...");
    try {
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "acceptSplit", args: [] });
      const freelancerGets = (escrowAmount * proposedSplit) / 100;
      const clientGets = escrowAmount - freelancerGets;
      setStatus("Success! Split accepted and funds distributed.");
      setSummary(`✅ Split Executed: You received ${clientGets} USDC back. Freelancer received ${freelancerGets} USDC.`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEarlyCancel = async () => {
    setLoading(true);
    setStatus("Awaiting signature to cancel escrow...");
    try {
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "requestCancel", args: [] });
      const refund = escrowAmount * 0.95;
      const fee = escrowAmount * 0.05;
      setStatus("Escrow cancelled. Funds refunded (minus fee).");
      setSummary(`✅ Escrow Cancelled: You received ${refund} USDC back. Cancellation fee: ${fee} USDC.`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleDecryptFile = async () => {
    if (!ipfsHash) return alert("No IPFS hash found!");
    if (!decryptionKey) return alert("Please enter the private key.");
    setIpfsLoading(true);
    setStatus("Fetching and decrypting file...");
    try {
      const trimmedKey = decryptionKey.trim();
      const response = await fetch(`http://localhost:3001/api/ipfs/${ipfsHash}`);
      if (!response.ok) throw new Error("Backend failed to fetch IPFS file.");
      const json = await response.json();
      const encryptedAesKeyObject = EthCrypto.cipher.parse(json.encryptedAesKey);
      const aesKey = await EthCrypto.decryptWithPrivateKey(trimmedKey, encryptedAesKeyObject);
      const decryptedBase64 = CryptoJS.AES.decrypt(json.encryptedFile, aesKey).toString(CryptoJS.enc.Utf8);
      const byteCharacters = atob(decryptedBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteNumbers[i] = byteCharacters.charCodeAt(i);
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = json.fileName || "decrypted_work_file.png";
      a.click();
      URL.revokeObjectURL(url);
      setStatus("✅ File decrypted and downloaded successfully!");
    } catch (error) {
      console.error("DECRYPTION ERROR DETAILS:", error);
      setStatus("Decryption failed. Check browser console (F12) for details.");
    } finally {
      setIpfsLoading(false);
    }
  };

  const mintTestUsdc = async () => {
    setLoading(true);
    try {
      await writeContractAsync({ address: USDC_ADDRESS, abi: usdcABI, functionName: "mint", args: [address, parseUnits("1000", 18)] });
      alert("Minted 1000 test USDC!");
    } catch (e: any) {
      console.error(e);
      alert(`Failed to mint: ${e.shortMessage || e.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isConnected) {
    return (
      <main className="flex min-h-[calc(100vh-80px)] flex-col items-center justify-center text-center">
        <div className="mb-8 h-16 w-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-purple-600 animate-pulse" />
        <h1 className="text-4xl font-bold tracking-tight mb-3">Connect Wallet</h1>
        <p className="text-white/50 max-w-md">Please connect your wallet to view and interact with this escrow.</p>
      </main>
    );
  }

  const Spinner = () => (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );

  return (
    <main className="w-full max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-8 tracking-tight">Escrow Details</h1>

      {!escrowData ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-white/10"><p className="text-white/40">Loading link details...</p></div>
      ) : (
        <div className="space-y-6">
          <div className="rounded-xl border border-white/5 bg-white/5 p-6">
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <p className="text-white/50 mb-1">Freelancer Address</p>
                <p className="break-all font-mono text-white/90">{escrowData.freelancerAddress}</p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-white/50 mb-1">Description</p>
                <p className="text-white/90">{escrowData.description}</p>
              </div>
              <div className="border-t border-white/10 pt-4">
                <p className="text-white/50 mb-1">Amount</p>
                <p className="text-3xl font-bold text-green-400">{escrowData.amount} <span className="text-lg text-white/50">USDC</span></p>
              </div>
            </div>
          </div>

          {stateNum === 0 && (
            <div className="space-y-3">
              <button onClick={handleFund} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loading ? (<><Spinner /> Processing...</>) : "Fund Escrow (Lock USDC)"}
              </button>
              <button onClick={mintTestUsdc} disabled={loading} className="w-full bg-white/5 hover:bg-white/10 text-white/70 text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {loading ? (<><Spinner /> Minting...</>) : "Need test USDC? Click to mint 1000"}
              </button>
            </div>
          )}

          {stateNum === 1 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-blue-500/30 bg-blue-900/10 p-4 text-center">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                  <h3 className="font-bold text-blue-400">Funded & Awaiting Work</h3>
                </div>
                <p className="text-sm text-white/50">The freelancer has not submitted work yet. You can cancel early for a 5% fee.</p>
              </div>
              <button onClick={mintTestUsdc} disabled={loading} className="w-full bg-white/5 hover:bg-white/10 text-white/70 text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {loading ? (<><Spinner /> Minting...</>) : "Need test USDC? Click to mint 1000"}
              </button>
              <button onClick={handleEarlyCancel} disabled={loading} className="w-full bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-500/30 text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {loading ? (<><Spinner /> Processing...</>) : "Request Early Cancellation (5% Fee)"}
              </button>
            </div>
          )}

          {stateNum === 2 && (
            <div className="space-y-6">
              <div className="rounded-xl border border-purple-500/30 bg-purple-900/10 p-6">
                <div className="flex items-center gap-2 mb-4">
                  <div className="h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
                  <h3 className="font-bold text-purple-400">Work Submitted!</h3>
                </div>
                <p className="text-xs text-white/50 mb-4 break-all font-mono">IPFS Hash: {ipfsHash}</p>
                <div className="mb-6 p-3 bg-black/30 rounded-lg border border-white/5">
                  <p className="text-xs text-white/50 mb-2">⚠️ Action Required</p>
                  {remainingTime > 0 ? (
                    <p className="font-mono text-yellow-400 text-sm">
                      If you don't act, funds will auto-release in: {Math.floor(remainingTime / 86400)}d {Math.floor((remainingTime % 86400) / 3600)}h {Math.floor((remainingTime % 3600) / 60)}m {remainingTime % 60}s
                    </p>
                  ) : (
                    <p className="text-green-400 font-medium text-sm">Time lock expired! The freelancer can now claim funds.</p>
                  )}
                </div>
                <div className="p-4 bg-black/30 rounded-lg border border-white/10">
                  <p className="text-sm text-white/70 mb-2">Enter Decryption Key</p>
                  <input type="text" value={decryptionKey} onChange={(e) => setDecryptionKey(e.target.value)} className="w-full px-3 py-2 bg-black/40 rounded border border-white/10 text-xs text-white/80 focus:outline-none focus:border-blue-500 mb-4" placeholder="0x..." />
                  <button onClick={handleDecryptFile} disabled={ipfsLoading || !decryptionKey} className="w-full bg-green-600 hover:bg-green-700 text-white text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {ipfsLoading ? (<><Spinner /> Fetching & Decrypting...</>) : "Decrypt & Download Original File"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={handleRelease} disabled={loading} className="bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? (<><Spinner /> Processing...</>) : "Approve & Release"}
                </button>
                <button onClick={handleReject} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? (<><Spinner /> Processing...</>) : "Reject Work"}
                </button>
              </div>
            </div>
          )}

          {stateNum === 4 && (
            <div className="space-y-4">
              <div className="rounded-xl border border-red-500/30 bg-red-900/10 p-6">
                <h3 className="font-bold text-red-400 mb-4">Work Rejected! (Disputed)</h3>
                {proposedSplit > 0 ? (
                  <div className="text-sm text-white/80">
                    <p>The freelancer is proposing to keep <strong className="text-yellow-400">{proposedSplit}%</strong> of the funds.</p>
                    <p className="text-white/50 mt-1">If you accept, you will receive <strong className="text-green-400">{100 - proposedSplit}%</strong> back.</p>
                  </div>
                ) : (
                  <p className="text-xs text-white/50">Waiting for the freelancer to propose a partial refund split...</p>
                )}
              </div>
              {proposedSplit > 0 && (
                <button onClick={handleAcceptSplit} disabled={loading} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading ? (<><Spinner /> Processing...</>) : `Accept ${proposedSplit}% Split`}
                </button>
              )}
            </div>
          )}

          {stateNum === 3 && (
            <div className="rounded-xl border border-green-500/30 bg-green-900/10 p-8 text-center">
              <div className="h-12 w-12 rounded-full bg-green-500/20 mx-auto mb-4 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-xl font-bold text-green-400">Funds Released!</h3>
              <p className="text-white/50 mt-2">The freelancer has been paid.</p>
            </div>
          )}

          {stateNum === 5 && escrowAmount > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center space-y-6">
              <div className="h-12 w-12 rounded-full bg-white/10 mx-auto flex items-center justify-center">
                <svg className="h-6 w-6 text-white/60" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-white/80">Escrow Cancelled</h3>
                <p className="text-white/50 mt-2">The escrow was cancelled early.</p>
              </div>
              <div className="grid grid-cols-2 gap-4 text-sm pt-6 border-t border-white/10">
                <div>
                  <p className="text-white/50 mb-1">Refunded to You</p>
                  <p className="text-xl font-bold text-green-400">{(escrowAmount * 0.95).toFixed(2)} <span className="text-sm text-white/50">USDC</span></p>
                </div>
                <div>
                  <p className="text-white/50 mb-1">Cancellation Fee</p>
                  <p className="text-xl font-bold text-red-400">{(escrowAmount * 0.05).toFixed(2)} <span className="text-sm text-white/50">USDC</span></p>
                </div>
              </div>
            </div>
          )}

          {status && <p className="text-sm text-white/50 text-center mt-4">{status}</p>}
          {summary && (
            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg text-center text-sm text-blue-200 font-mono">{summary}</div>
          )}
        </div>
      )}
    </main>
  );
}