"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAccount, useWriteContract, useReadContracts, useBlock } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { escrowABI, usdcABI } from "@/lib/abi";
import { parseUnits } from "viem";
import { API_BASE_URL, ESCROW_ADDRESS, USDC_ADDRESS } from "@/lib/config";
import EthCrypto from "eth-crypto";
import CryptoJS from "crypto-js";
import { parseEncryptedFilePayload, validatePrivateKey } from "@/lib/fileValidation";

export default function EscrowPage() {
  const params = useParams();
  const escrowId = params?.id ? (Array.isArray(params.id) ? params.id[0] : params.id as string) : ""; 
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();

  const [escrowData, setEscrowData] = useState<any>(null);
  const [loadingAction, setLoadingAction] = useState("");
  const [status, setStatus] = useState("");
  const [summary, setSummary] = useState("");
  const [decryptionKey, setDecryptionKey] = useState("");
  const [remainingTime, setRemainingTime] = useState(0);
  const [clientEscrowList, setClientEscrowList] = useState<any[]>([]);

  const TIME_LOCK_SECONDS = 604800;

  // Read specific escrow fields using getter functions
  const { data: contractData } = useReadContracts({
    contracts: [
      { address: ESCROW_ADDRESS, abi: escrowABI, functionName: "getEscrowState", args: [String(escrowId)] },
      { address: ESCROW_ADDRESS, abi: escrowABI, functionName: "getEscrowAmount", args: [String(escrowId)] },
      { address: ESCROW_ADDRESS, abi: escrowABI, functionName: "getEscrowSubmissionTime", args: [String(escrowId)] },
      { address: ESCROW_ADDRESS, abi: escrowABI, functionName: "getEscrowProposedSplit", args: [String(escrowId)] },
      { address: ESCROW_ADDRESS, abi: escrowABI, functionName: "getEscrowIpfsHash", args: [String(escrowId)] },
    ],
    query: { 
      refetchInterval: 2000,
      enabled: !!escrowId
    }
  });

  const stateNum = contractData?.[0]?.status === 'success' ? Number(contractData[0].result) : -1;
  const escrowAmountBigInt = contractData?.[1]?.status === 'success' ? contractData[1].result as bigint : 0n;
  const escrowAmount = Number(escrowAmountBigInt / 1000000000000000000n);
  const submissionTimestamp = contractData?.[2]?.status === 'success' ? Number(contractData[2].result) : 0;
  const proposedSplit = contractData?.[3]?.status === 'success' ? Number(contractData[3].result) : 0;
  const ipfsHash = contractData?.[4]?.status === 'success' ? contractData[4].result as string : "";

  // Get latest block timestamp from blockchain
  const { data: block } = useBlock({ blockTag: 'latest', query: { refetchInterval: 1000 } });

  useEffect(() => {
    if (stateNum === 2 && submissionTimestamp > 0 && block?.timestamp) {
      const expiryTime = BigInt(submissionTimestamp) + BigInt(TIME_LOCK_SECONDS);
      const diff = expiryTime - block.timestamp;
      setRemainingTime(Number(diff) > 0 ? Number(diff) : 0);
    }
  }, [stateNum, submissionTimestamp, block]);

  useEffect(() => {
    if (escrowId) {
      fetch(`${API_BASE_URL}/api/escrow/${escrowId}`)
        .then(res => res.json())
        .then(data => setEscrowData(data));
    }
  }, [escrowId]);

  useEffect(() => {
    setStatus("");
    setSummary("");
  }, [stateNum]);

  // Load client's escrow list from localStorage
  useEffect(() => {
    const savedList = localStorage.getItem("linkpe_client_escrows");
    if (savedList) {
      setClientEscrowList(JSON.parse(savedList));
    }
  }, []);

  // Save current escrow to list as soon as backend data is loaded
  useEffect(() => {
    if (escrowData && escrowId) {
      const newItem = {
        id: escrowId,
        amount: escrowData.amount,
        description: escrowData.description
      };
      setClientEscrowList((prev) => {
        const filtered = prev.filter(item => item.id !== escrowId);
        const updated = [newItem, ...filtered];
        localStorage.setItem("linkpe_client_escrows", JSON.stringify(updated));
        return updated;
      });
    }
  }, [escrowData, escrowId]);
  
  const handleFund = async () => {
    if (!escrowData) return;
    setLoadingAction("fund");
    setStatus("1/2: Approving USDC...");
    try {
      await writeContractAsync({ address: USDC_ADDRESS, abi: usdcABI, functionName: "approve", args: [ESCROW_ADDRESS, parseUnits(escrowData.amount.toString(), 18)] });
      setStatus("2/2: Funding Escrow...");
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "createAndFundEscrow", args: [escrowId, escrowData.freelancerAddress, parseUnits(escrowData.amount.toString(), 18)] });
      setStatus("Success! Escrow funded.");
      setSummary(`✅ Escrow Funded: You locked ${escrowData.amount} USDC.`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  const handleRelease = async () => {
    setLoadingAction("release");
    setStatus("Awaiting signature to release funds...");
    try {
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "releaseFunds", args: [escrowId] });
      setStatus("Success! Funds released to freelancer.");
      setSummary(`✅ Transaction Complete: You released ${escrowAmount} USDC to the freelancer.`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  const handleReject = async () => {
    setLoadingAction("reject");
    setStatus("Awaiting signature to reject work...");
    try {
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "rejectWork", args: [escrowId] });
      setStatus("Work rejected. Dispute started.");
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  const handleAcceptSplit = async () => {
    setLoadingAction("split");
    setStatus("Awaiting signature to accept split...");
    try {
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "acceptSplit", args: [escrowId] });
      const freelancerGets = (escrowAmount * proposedSplit) / 100;
      const clientGets = escrowAmount - freelancerGets;
      setStatus("Success! Split accepted and funds distributed.");
      setSummary(`✅ Split Executed: You received ${clientGets} USDC back. Freelancer received ${freelancerGets} USDC.`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  const handleDefaultJudgment = async () => {
    setLoadingAction("judgment");
    setStatus("Awaiting signature to execute the dispute fallback...");
    try {
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "defaultJudgment", args: [escrowId] });
      setStatus("Dispute fallback executed. Funds were settled by the contract rules.");
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  const handleEarlyCancel = async () => {
    setLoadingAction("cancel");
    setStatus("Awaiting signature to cancel escrow...");
    try {
      await writeContractAsync({ address: ESCROW_ADDRESS, abi: escrowABI, functionName: "requestCancel", args: [escrowId] });
      const refund = escrowAmount * 0.95;
      const fee = escrowAmount * 0.05;
      setStatus("Escrow cancelled. Funds refunded (minus fee).");
      setSummary(`✅ Escrow Cancelled: You received ${refund} USDC back. Cancellation fee: ${fee} USDC.`);
    } catch (error: any) {
      console.error(error);
      setStatus(`Transaction failed: ${error.shortMessage || error.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  const handleDecryptFile = async () => {
    if (!ipfsHash) return alert("No IPFS hash found!");
    if (!decryptionKey) return alert("Please enter the private key.");
    setLoadingAction("decrypt");
    setStatus("Fetching and decrypting file...");
    try {
      const trimmedKey = decryptionKey.trim();
      validatePrivateKey(trimmedKey);
      const response = await fetch(`${API_BASE_URL}/api/ipfs/${ipfsHash}`);
      if (!response.ok) throw new Error("Backend failed to fetch IPFS file.");
      const json = parseEncryptedFilePayload(await response.json());
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
      setStatus(error instanceof Error ? error.message : "Decryption failed. Check the key and uploaded file.");
    } finally {
      setLoadingAction("");
    }
  };

  const mintTestUsdc = async () => {
    setLoadingAction("mint");
    try {
      await writeContractAsync({ address: USDC_ADDRESS, abi: usdcABI, functionName: "mint", args: [address, parseUnits("1000", 18)] });
      alert("Minted 1000 test USDC!");
    } catch (e: any) {
      console.error(e);
      alert(`Failed to mint: ${e.shortMessage || e.message}`);
    } finally {
      setLoadingAction("");
    }
  };

  if (!isConnected) {
    return (
      <main className="flex min-h-[calc(100vh-80px)] flex-col items-center justify-center text-center">
        <div className="mb-8 h-16 w-16 rounded-2xl bg-gradient-to-tr from-blue-500 to-purple-600 flex items-center justify-center animate-pulse">
          <svg className="h-10 w-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
          </svg>
        </div>
        <h1 className="text-4xl font-bold tracking-tight mb-3">Connect Wallet</h1>
        <p className="text-white/50 max-w-md">Please connect your wallet to view and interact with this escrow.</p>
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
    <main className="w-full max-w-2xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-8 tracking-tight">Escrow Details</h1>

      {!escrowData ? (
        <div className="text-center py-16 rounded-xl border border-dashed border-white/10"><p className="text-white/40">Loading link details...</p></div>
      ) : (
        <div className="space-y-6">
          {/* Client Escrow List */}
          {clientEscrowList.length > 0 && (
            <div className="rounded-xl border border-white/5 bg-white/5 p-4 space-y-2">
              <p className="text-sm text-white/50 mb-2">Your Escrows ({clientEscrowList.length})</p>
              <div className="max-h-60 overflow-y-auto space-y-2">
                {clientEscrowList.map((item) => (
                  <div 
                    key={item.id}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${escrowId === item.id ? 'bg-blue-600/20 border-blue-500' : 'bg-black/30 border-white/5 hover:bg-black/40'}`}
                  >
                    <div className="flex justify-between items-center">
                      <a href={`/escrow/${item.id}`} className="flex-1">
                        <p className="text-sm text-white/80 truncate">{item.description}</p>
                        <p className="text-xs text-white/40 truncate mt-1 font-mono">{item.id}</p>
                      </a>
                      <div className="flex items-center gap-3 ml-2">
                        <p className="text-sm text-green-400">{item.amount} USDC</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Display Current UUID */}
          <div className="rounded-xl border border-white/5 bg-white/5 p-6">
            <div className="grid grid-cols-1 gap-4 text-sm">
              <div>
                <p className="text-white/50 mb-1">Escrow ID (UUID)</p>
                <div className="flex items-center gap-2 bg-black/30 rounded-lg p-2 border border-white/5">
                  <p className="break-all font-mono text-white/90 flex-1 pl-2 text-xs">{escrowId}</p>
                  <button 
                    onClick={() => { navigator.clipboard.writeText(escrowId); setStatus("✅ UUID Copied!"); setTimeout(() => setStatus(""), 2000); }}
                    className="bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded text-xs font-medium transition-colors"
                  >
                    Copy
                  </button>
                </div>
              </div>
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
              <button onClick={handleFund} disabled={loadingAction === "fund"} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loadingAction === "fund" ? (<><Spinner /> Processing...</>) : "Fund Escrow (Lock USDC)"}
              </button>
              <button onClick={mintTestUsdc} disabled={loadingAction === "mint"} className="w-full bg-white/5 hover:bg-white/10 text-white/70 text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {loadingAction === "mint" ? (<><Spinner /> Minting...</>) : "Need test USDC? Click to mint 1000"}
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
              <button onClick={mintTestUsdc} disabled={loadingAction === "mint"} className="w-full bg-white/5 hover:bg-white/10 text-white/70 text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {loadingAction === "mint" ? (<><Spinner /> Minting...</>) : "Need test USDC? Click to mint 1000"}
              </button>
              <button onClick={handleEarlyCancel} disabled={loadingAction === "cancel"} className="w-full bg-red-900/20 hover:bg-red-900/40 text-red-400 border border-red-500/30 text-sm py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2">
                {loadingAction === "cancel" ? (<><Spinner /> Processing...</>) : "Request Early Cancellation (5% Fee)"}
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
                  <button onClick={handleDecryptFile} disabled={loadingAction === "decrypt" || !decryptionKey} className="w-full bg-green-600 hover:bg-green-700 text-white text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                    {loadingAction === "decrypt" ? (<><Spinner /> Fetching & Decrypting...</>) : "Decrypt & Download Original File"}
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <button onClick={handleRelease} disabled={loadingAction === "release"} className="bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {loadingAction === "release" ? (<><Spinner /> Processing...</>) : "Approve & Release"}
                </button>
                <button onClick={handleReject} disabled={loadingAction === "reject"} className="bg-red-600 hover:bg-red-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {loadingAction === "reject" ? (<><Spinner /> Processing...</>) : "Reject Work"}
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
                  <p className="text-xs text-white/50">Waiting for the freelancer to propose a partial refund split. The contract also provides a fallback judgment path.</p>
                )}
              </div>
              {proposedSplit > 0 && (
                <button onClick={handleAcceptSplit} disabled={loadingAction === "split"} className="w-full bg-orange-600 hover:bg-orange-700 text-white font-medium py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                  {loadingAction === "split" ? (<><Spinner /> Processing...</>) : `Accept ${proposedSplit}% Split`}
                </button>
              )}
              <button onClick={handleDefaultJudgment} disabled={loadingAction === "judgment"} className="w-full bg-white/10 hover:bg-white/15 text-white/80 border border-white/10 text-sm py-2.5 rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
                {loadingAction === "judgment" ? (<><Spinner /> Processing...</>) : "Execute Contract Fallback Judgment"}
              </button>
              <p className="text-xs text-white/40 text-center">Uses the contract's dispute timeout rules and preserves its settlement logic.</p>
            </div>
          )}

          {/* Released State (3) */}
          {stateNum === 3 && escrowAmount > 0 && (
            <div className="rounded-xl border border-green-500/30 bg-green-900/10 p-8 text-center space-y-6">
              <div className="h-12 w-12 rounded-full bg-green-500/20 mx-auto flex items-center justify-center">
                <svg className="h-6 w-6 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
              </div>
              <div>
                <h3 className="text-xl font-bold text-green-400">Funds Released!</h3>
                <p className="text-white/50 mt-2">The freelancer has been paid.</p>
              </div>
              <div className="pt-6 border-t border-white/10">
                <p className="text-white/50 text-sm mb-1">Released to Freelancer</p>
                <p className="text-2xl font-bold text-green-400">
                  {proposedSplit > 0 ? (escrowAmount * proposedSplit / 100).toFixed(2) : escrowAmount} 
                  <span className="text-lg text-white/50"> USDC</span>
                </p>
              </div>
              
              {/* Show refund amount if it was a split */}
              {proposedSplit > 0 && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-white/50 text-sm mb-1">Refunded to You</p>
                  <p className="text-2xl font-bold text-yellow-400">
                    {(escrowAmount - (escrowAmount * proposedSplit / 100)).toFixed(2)} 
                    <span className="text-lg text-white/50"> USDC</span>
                  </p>
                </div>
              )}
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