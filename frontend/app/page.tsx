"use client";
import { useState, useEffect } from "react";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { escrowABI } from "@/lib/abi";
import { encryptAndUploadFile } from "@/lib/ipfs";
import EthCrypto from "eth-crypto";

const ESCROW_ADDRESS = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
const TIME_LOCK_SECONDS = 604800; // 7 days

export default function Home() {
  const [splitPercent, setSplitPercent] = useState("");
  const [activeTab, setActiveTab] = useState("create");
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [link, setLink] = useState("");
  const [loadingAction, setLoadingAction] = useState("");
  
  const [file, setFile] = useState<File | null>(null);
  const [txStatus, setTxStatus] = useState("");
  const [remainingTime, setRemainingTime] = useState(0);
  const [generatedPrivateKey, setGeneratedPrivateKey] = useState("");
  const [copied, setCopied] = useState(false);
  const [toast, setToast] = useState("");

  const { data: contractState } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: "currentEscrow",
    query: { refetchInterval: 2000 }
  });

  const stateAsAny = contractState as any;
  const stateNum = stateAsAny ? Number(stateAsAny.state ?? stateAsAny[3]) : -1;
  const clientAddr = stateAsAny ? stateAsAny.client ?? stateAsAny[1] : "";
  const submissionTimestamp = stateAsAny ? Number(stateAsAny.submissionTimestamp ?? stateAsAny[4]) : 0;
  const escrowAmount = stateAsAny ? Number(stateAsAny.amount) / 1e18 : 0;

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
    const savedKey = localStorage.getItem("linkpe_demo_private_key");
    if (savedKey) setGeneratedPrivateKey(savedKey);
  }, []);

  useEffect(() => {
    if (stateNum > 0 && stateNum !== 5) {
      setActiveTab("active");
    } else if (stateNum === 0 || stateNum === 5) {
      setActiveTab("create");
    }
  }, [stateNum]);

  useEffect(() => {
    setTxStatus("");
    if (stateNum !== 4) setSplitPercent("");
  }, [stateNum]);

  const generateLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAction("create");
    setLink("");
    try {
      const response = await fetch("http://localhost:3001/api/escrow", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ freelancerAddress: address, amount: Number(amount), description: description }),
      });
      const data = await response.json();
      if (data.id) {
        setLink(`http://localhost:3000/escrow/${data.id}`);
        setToast("Link generated successfully!");
        setTimeout(() => setToast(""), 3000);
      }
    } catch (error) {
      console.error(error);
    } finally {
      setLoadingAction("");
    }
  };

  const handleFileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return alert("Please select a file first.");
    setLoadingAction("submit");
    setTxStatus("Encrypting file & uploading to IPFS...");
    try {
      const demoClientIdentity = EthCrypto.createIdentity();
      setGeneratedPrivateKey(demoClientIdentity.privateKey);
      localStorage.setItem("linkpe_demo_private_key", demoClientIdentity.privateKey);
      const ipfsHash = await encryptAndUploadFile(file, demoClientIdentity.publicKey);
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
      setLoadingAction("");
    }
  };

  const handleAutoRelease = async () => {
    setLoadingAction("release");
    setTxStatus("Awaiting signature to auto-release funds...");
    try {
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowABI,
        functionName: "autoReleaseFunds",
        args: [],
      });
      setTxStatus(`✅ Success! You received ${escrowAmount} USDC.`);
      localStorage.removeItem("linkpe_demo_private_key");
    } catch (error: any) {
      console.error(error);
      setTxStatus("Transaction failed. Time lock may not be expired yet.");
    } finally {
      setLoadingAction("");
    }
  };

  const handleProposeSplit = async () => {
    setLoadingAction("split");
    setTxStatus("Awaiting signature to propose split...");
    try {
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowABI,
        functionName: "proposeSplit",
        args: [Number(splitPercent)],
      });
      const freelancerGets = (escrowAmount * Number(splitPercent)) / 100;
      setTxStatus(`✅ Success! Proposed ${splitPercent}% split. You will receive ${freelancerGets} USDC if accepted.`);
    } catch (error: any) {
      console.error(error);
      setTxStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  if (!isConnected) {
    return (
      <main className="flex min-h-[calc(100vh-80px)] flex-col items-center justify-center text-center">
        <div className="mb-8 h-16 w-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-purple-600 animate-pulse" />
        <h1 className="text-4xl font-bold tracking-tight mb-3">Welcome to LinkPe</h1>
        <p className="text-white/50 max-w-md">Connect your wallet to start creating trustless, encrypted freelance escrows.</p>
        <div className="mt-8"><ConnectButton /></div>
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
    <main className="w-full">
      {/* Stats Header */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div className="rounded-xl border border-white/5 bg-white/5 p-4">
          <p className="text-sm text-white/50">Total Earned</p>
          <p className="text-2xl font-bold mt-1">{stateNum === 3 ? escrowAmount : 0} <span className="text-sm text-white/50">USDC</span></p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/5 p-4">
          <p className="text-sm text-white/50">Active Escrows</p>
          <p className="text-2xl font-bold mt-1">{stateNum > 0 && stateNum !== 5 ? 1 : 0}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/5 p-4">
          <p className="text-sm text-white/50">Open Disputes</p>
          <p className="text-2xl font-bold mt-1 text-red-400">{stateNum === 4 ? 1 : 0}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 mb-8">
        <button onClick={() => setActiveTab("create")} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "create" ? "text-white border-b-2 border-blue-500" : "text-white/50 hover:text-white"}`}>Create Escrow</button>
        <button onClick={() => setActiveTab("active")} className={`px-4 py-2 text-sm font-medium transition-colors ${activeTab === "active" ? "text-white border-b-2 border-blue-500" : "text-white/50 hover:text-white"}`}>Active Escrow</button>
      </div>

      {activeTab === "create" && (
        <div className="max-w-2xl mx-auto">
          <div className="rounded-xl border border-white/5 bg-white/5 p-8">
            <h2 className="text-xl font-bold mb-6">Create New Escrow</h2>
            <form onSubmit={generateLink} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-white/70 mb-2">Amount (USDC)</label>
                <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full px-3 py-2.5 bg-black/30 rounded-lg border border-white/10 focus:outline-none focus:border-blue-500 transition-colors" placeholder="e.g. 500" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-white/70 mb-2">Milestone Description</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full px-3 py-2.5 bg-black/30 rounded-lg border border-white/10 focus:outline-none focus:border-blue-500 transition-colors" placeholder="e.g. Build a landing page" required />
              </div>
              <button type="submit" disabled={loadingAction === "create"} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loadingAction === "create" ? (<><Spinner /> Generating...</>) : "Generate Escrow Link"}
              </button>
            </form>
            {link && (
              <div className="mt-6 p-4 bg-green-900/20 border border-green-500/30 rounded-lg space-y-3">
                <p className="text-green-400 text-sm font-medium text-center">Link Generated!</p>
                <div className="flex items-center gap-2 bg-black/40 rounded-lg p-2 border border-white/5">
                  <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all text-sm flex-1 pl-2">{link}</a>
                  <button onClick={() => { navigator.clipboard.writeText(link); setToast("Link copied to clipboard!"); setTimeout(() => setToast(""), 3000); }} className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors">Copy</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "active" && (
        <div className="max-w-2xl mx-auto space-y-6">
          {stateNum <= 0 && (
            <div className="text-center py-16 rounded-xl border border-dashed border-white/10">
              <p className="text-white/40">No active escrows. Create one to get started.</p>
            </div>
          )}

          {stateNum === 1 && (
            <div className="rounded-xl border border-blue-500/30 bg-blue-900/10 p-6">
              <div className="flex items-center gap-2 mb-4">
                <div className="h-2 w-2 rounded-full bg-blue-400 animate-pulse" />
                <h3 className="font-bold text-blue-400">Funded by Client!</h3>
              </div>
              <p className="text-sm text-white/60 mb-4">Client Address: {clientAddr}</p>
              <div className="border-t border-white/10 pt-6 mt-6">
                <h4 className="font-medium mb-4">Submit Encrypted Work</h4>
                <form onSubmit={handleFileSubmit} className="space-y-4">
                  <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} className="w-full text-sm text-white/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-500/20 file:text-blue-300 hover:file:bg-blue-500/30 cursor-pointer" required />
                  <button type="submit" disabled={loadingAction === "submit"} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {loadingAction === "submit" ? (<><Spinner /> Processing...</>) : "Encrypt & Submit Work"}
                  </button>
                </form>
              </div>
            </div>
          )}

          {stateNum === 2 && (
            <div className="rounded-xl border border-purple-500/30 bg-purple-900/10 p-6">
              <h3 className="font-bold text-purple-400 mb-4">Work Submitted!</h3>
              <div className="mb-6 p-3 bg-black/30 rounded-lg border border-white/5">
                <p className="text-xs text-white/50 mb-2">Auto-Release Timer</p>
                {remainingTime > 0 ? (
                  <p className="font-mono text-yellow-400">{Math.floor(remainingTime / 86400)}d {Math.floor((remainingTime % 86400) / 3600)}h {Math.floor((remainingTime % 3600) / 60)}m {remainingTime % 60}s</p>
                ) : (
                  <p className="text-green-400 font-medium">Time lock expired!</p>
                )}
              </div>
              {generatedPrivateKey && (
                <div className="mb-6 p-4 bg-yellow-900/10 border border-yellow-500/30 rounded-lg">
                  <p className="text-sm text-yellow-400 font-medium mb-2">Client Decryption Key</p>
                  <div className="flex gap-2">
                    <input value={generatedPrivateKey} readOnly className="flex-1 px-2 py-1.5 bg-black/40 rounded text-xs text-white/70 border border-white/5" />
                    <button onClick={() => { navigator.clipboard.writeText(generatedPrivateKey); setCopied(true); setTimeout(() => setCopied(false), 2000); }} className="px-3 bg-white/10 hover:bg-white/20 rounded text-xs font-medium transition-colors">{copied ? "Copied!" : "Copy"}</button>
                  </div>
                </div>
              )}
              <button onClick={handleAutoRelease} disabled={loadingAction === "release" || remainingTime > 0} className="w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loadingAction === "release" ? (<><Spinner /> Processing...</>) : "Claim Auto-Release"}
              </button>
            </div>
          )}

          {stateNum === 4 && (
            <div className="rounded-xl border border-red-500/30 bg-red-900/10 p-6">
              <h3 className="font-bold text-red-400 mb-4">Work Rejected! (Disputed)</h3>
              <div className="flex gap-2">
                <input type="number" value={splitPercent} onChange={(e) => setSplitPercent(e.target.value)} className="flex-1 px-3 py-2.5 bg-black/30 rounded-lg border border-white/10 focus:outline-none focus:border-blue-500" placeholder="e.g. 50 (for 50%)" />
                <button onClick={handleProposeSplit} disabled={loadingAction === "split" || !splitPercent} className="bg-orange-600 hover:bg-orange-700 text-white font-medium py-2.5 px-4 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {loadingAction === "split" ? (<><Spinner /> Processing...</>) : "Propose Split"}
                </button>
              </div>
            </div>
          )}

          {stateNum === 3 && (
            <div className="text-center py-16 rounded-xl border border-green-500/30 bg-green-900/10">
              <div className="h-12 w-12 rounded-full bg-green-500/20 mx-auto mb-4 flex items-center justify-center">
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <h3 className="text-xl font-bold text-green-400">Funds Released!</h3>
              <p className="text-white/50 mt-2">This escrow is complete. You can generate a new one.</p>
            </div>
          )}
          {txStatus && <p className="text-sm text-white/50 text-center mt-4">{txStatus}</p>}
        </div>
      )}

      {toast && (
        <div className="fixed bottom-8 right-8 z-50 bg-black/80 backdrop-blur-xl text-green-400 px-4 py-3 rounded-lg shadow-2xl border border-green-500/30 text-sm font-medium flex items-center gap-2">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
          {toast}
        </div>
      )}
    </main>
  );
}