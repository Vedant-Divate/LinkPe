"use client";
import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { useAccount, useWriteContract, useReadContract } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { escrowABI, usdcABI } from "@/lib/abi";
import { parseUnits } from "viem";
import EthCrypto  from "eth-crypto";
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

  const { data: contractState, isFetched } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: "currentEscrow",
    query: {
      refetchInterval: 2000, // Auto-refetch every 2 seconds
    }
  });

  // Read the IPFS Hash
  const { data: ipfsHashData } = useReadContract({
    address: ESCROW_ADDRESS,
    abi: escrowABI,
    functionName: "currentIpfsHash",
    query: {
      refetchInterval: 2000,
    }
  });

  // Cast to any to bypass TypeScript struct strictness, and fallback to array index just in case
  const stateAsAny = contractState as any;
  const stateNum = stateAsAny ? Number(stateAsAny.state ?? stateAsAny[3]) : -1;
  const proposedSplit = stateAsAny ? Number(stateAsAny.proposedSplit ?? stateAsAny[6]) : 0;
  const ipfsHash = ipfsHashData as string;
  const escrowAmount = stateAsAny ? Number(stateAsAny.amount) / 1e18 : 0;

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
    } catch (error: any) {
      console.error(error);
      const reason = error.shortMessage || error.message;
      setStatus(`Transaction failed: ${reason}`);
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
      setSummary(`✅ Transaction Complete: Freelancer received ${escrowAmount} USDC.`);
    } catch (error: any) {
      console.error(error);
      const reason = error.shortMessage || error.message;
      setStatus(`Transaction failed: ${reason}`);
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
    } catch (error: any) {
      console.error(error);
      const reason = error.shortMessage || error.message;
      setStatus(`Transaction failed: ${reason}`);
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
      // setStatus("Success! Split accepted and funds distributed.");
      const freelancerGets = (escrowAmount * proposedSplit) / 100;
      const clientGets = escrowAmount - freelancerGets;
      setStatus("Success! Split accepted and funds distributed.");
      setSummary(`✅ Split Executed: Freelancer received ${freelancerGets} USDC. Client refunded ${clientGets} USDC.`);
    } catch (error: any) {
      console.error(error);
      const reason = error.shortMessage || error.message;
      setStatus(`Transaction failed: ${reason}`);
    } finally {
      setLoading(false);
    }
  };

  const handleEarlyCancel = async () => {
    setLoading(true);
    setStatus("Awaiting signature to cancel escrow...");
    try {
      await writeContractAsync({
        address: ESCROW_ADDRESS,
        abi: escrowABI,
        functionName: "requestCancel",
        args: [],
      });
      const refund = escrowAmount * 0.95;
      const fee = escrowAmount * 0.05;
      setStatus("Escrow cancelled. Funds refunded (minus fee).");
      setSummary(`✅ Escrow Cancelled: Client refunded ${refund} USDC. Cancellation fee: ${fee} USDC.`);
    } catch (error: any) {
      console.error(error);
      const reason = error.shortMessage || error.message;
      setStatus(`Transaction failed: ${reason}`);
    } finally {
      setLoading(false);
    }
  };

  const fetchAndDownloadIPFS = async () => {
    if (!ipfsHash) return alert("No IPFS hash found!");
    setIpfsLoading(true);
    setStatus("Fetching encrypted payload from IPFS...");
    try {
      const response = await fetch(`https://ipfs.io/ipfs/${ipfsHash}`);
      const json = await response.json();
    
      // Create and download the file
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = "encrypted_ipfs_payload.json";
      a.click();
      URL.revokeObjectURL(url); // Clean up memory
    
      setStatus("✅ Encrypted IPFS payload downloaded successfully!");
    } catch (error) {
      console.error(error);
      setStatus("Failed to fetch from IPFS.");
    } finally {
      setIpfsLoading(false);
    }
  };

  const handleDecryptFile = async () => {
    if (!ipfsHash) return alert("No IPFS hash found!");
    if (!decryptionKey) return alert("Please enter the private key.");
    
    setIpfsLoading(true);
    setStatus("Fetching and decrypting file...");
    try {
      const trimmedKey = decryptionKey.trim();
      
      // 1. Fetch the encrypted JSON from YOUR backend (bypasses CORS!)
      const response = await fetch(`http://localhost:3001/api/ipfs/${ipfsHash}`);
      
      if (!response.ok) {
        throw new Error("Backend failed to fetch IPFS file.");
      }
      
      const json = await response.json();
      console.log("Fetched IPFS payload via backend:", json);
      
      // 2. Decrypt the AES key using the Client's Private Key
      const encryptedAesKeyObject = EthCrypto.cipher.parse(json.encryptedAesKey);
      const aesKey = await EthCrypto.decryptWithPrivateKey(trimmedKey, encryptedAesKeyObject);
      
      // 3. Decrypt the file using the decrypted AES key
      const decryptedBase64 = CryptoJS.AES.decrypt(json.encryptedFile, aesKey).toString(CryptoJS.enc.Utf8);
      
      // 4. Convert Base64 back to a downloadable file
      const byteCharacters = atob(decryptedBase64);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "application/octet-stream" });
      
      // 5. Download the original file
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
      await writeContractAsync({
        address: USDC_ADDRESS,
        abi: usdcABI,
        functionName: "mint",
        args: [address, parseUnits("1000", 18)],
      });
      alert("Minted 1000 test USDC!");
    } catch (e: any) {
      console.error(e);
      const reason = e.shortMessage || e.message;
      alert(`Failed to mint: ${reason}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col items-center py-12">
      {/* <div className="absolute top-8 right-8">
        <ConnectButton />
      </div> */}

      <h1 className="text-3xl font-bold mb-8">Pending Escrow Request</h1>

      {/* DEBUG BOX */}
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

          {/* Show Fund and Early Cancel buttons if State is 1 (Funded) */}
          {stateNum === 1 && (
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
                className="w-full bg-gray-600 hover:bg-gray-700 text-white text-sm py-2 px-4 rounded transition-colors mb-4"
              >
                Need test USDC? Click to mint 1000
              </button>
              {/* Early Cancel Button */}
              <button
                onClick={handleEarlyCancel}
                disabled={loading}
                className="w-full bg-red-800 hover:bg-red-900 text-white text-sm py-2 px-4 rounded transition-colors border border-red-500"
              >
                Request Early Cancellation (5% Fee)
              </button>
            </>
          )}

          {stateNum === 2 && (
             <div className="mt-4">
               <div className="p-4 bg-purple-900/50 border border-purple-500 rounded-lg mb-6">
                 <p className="text-purple-400 font-bold mb-2">Work Submitted!</p>
                 <p className="text-xs text-gray-300 break-all mb-4">IPFS Hash: {ipfsHash}</p>
                 
                 {/* Decryption Input */}
                 <div className="mt-4 p-4 bg-gray-800 border border-gray-600 rounded-lg">
                   <p className="text-sm text-gray-400 mb-2">Enter Client Private Key to decrypt file:</p>
                   <input 
                     type="text" 
                     value={decryptionKey}
                     onChange={(e) => setDecryptionKey(e.target.value)}
                     className="w-full px-3 py-2 mb-4 bg-gray-700 rounded border border-gray-600 text-xs break-all"
                     placeholder="0x..."
                   />
                   <button 
                     onClick={handleDecryptFile}
                     disabled={ipfsLoading || !decryptionKey}
                     className="w-full bg-green-700 hover:bg-green-600 text-white text-sm py-2 px-4 rounded transition-colors disabled:opacity-50"
                   >
                     {ipfsLoading ? "Decrypting..." : "Decrypt & Download Original File"}
                   </button>
                 </div>
               </div>
               <div className="flex gap-4">
                 <button onClick={handleRelease} disabled={loading} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50">
                   {loading ? "Processing..." : "Approve & Release"}
                 </button>
                 <button onClick={handleReject} disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded transition-colors disabled:opacity-50">
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
            </div>
          )}

          {/* Show Success message if State is 3 (Released) */}
          {stateNum === 3 && (
            <div className="p-4 bg-green-900/50 border border-green-500 rounded-lg text-center">
              <p className="text-green-400 font-bold">Funds Released!</p>
              <p className="text-sm text-gray-300 mt-2">The freelancer has been paid.</p>
            </div>
          )}

          {/* Show Cancelled message if State is 5 (Cancelled) */}
          {stateNum === 5 && (
            <div className="p-4 bg-gray-700 border border-gray-500 rounded-lg text-center">
              <p className="text-gray-300 font-bold">Escrow Cancelled</p>
              <p className="text-sm text-gray-400 mt-2">Funds were refunded (minus cancellation fee).</p>
            </div>
          )}

          {status && <p className="text-center text-sm text-gray-300 mt-4">{status}</p>}

          {/* Financial Summary Box */}
          {summary && (
            <div className="mt-4 p-4 bg-blue-900/50 border border-blue-500 rounded-lg text-center text-sm text-blue-200 font-mono">
              {summary}
            </div>
          )}
        </div>
      )}
    </main>
  );
}