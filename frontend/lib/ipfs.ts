import axios from "axios";
import  EthCrypto  from "eth-crypto";
import CryptoJS from "crypto-js";

const PINATA_API_KEY = process.env.NEXT_PUBLIC_PINATA_API_KEY;
const PINATA_SECRET_KEY = process.env.NEXT_PUBLIC_PINATA_API_SECRET;

export async function encryptAndUploadFile(file: File, clientPublicKey: string) {
  // 1. Convert file to Base64
  const fileData = await file.arrayBuffer();
  const buffer = Buffer.from(fileData);
  const fileBase64 = buffer.toString("base64");

  // 2. Generate random symmetric AES key
  const aesKey = CryptoJS.lib.WordArray.random(32).toString();

  // 3. Encrypt the file with AES
  const encryptedFile = CryptoJS.AES.encrypt(fileBase64, aesKey).toString();

  // 4. Encrypt the AES key with Client's Public Key
  const encryptedAesKey = await EthCrypto.encryptWithPublicKey(
    clientPublicKey,
    aesKey
  );
  const encryptedAesKeyString = EthCrypto.cipher.stringify(encryptedAesKey);

  // 5. Upload both to IPFS via Pinata
  const payload = JSON.stringify({
    pinataContent: {
      encryptedFile: encryptedFile,
      encryptedAesKey: encryptedAesKeyString,
      fileName: file.name, // <--- ADD THIS LINE
    },
  });

  console.log("Uploading to Pinata...");
  const response = await axios.post("https://api.pinata.cloud/pinning/pinJSONToIPFS", payload, {
    headers: {
      "Content-Type": "application/json",
      pinata_api_key: PINATA_API_KEY,
      pinata_secret_api_key: PINATA_SECRET_KEY,
    },
  });

  // VALIDATION CHECK
  if (!response.data || !response.data.IpfsHash) {
    console.error("Pinata API Response:", response.data);
    throw new Error("Pinata did not return a valid IPFS hash. Check your API keys in the .env file.");
  }

  console.log("✅ Pinata upload successful! Hash:", response.data.IpfsHash);
  return response.data.IpfsHash;
}