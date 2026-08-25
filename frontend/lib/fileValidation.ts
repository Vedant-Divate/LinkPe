const MAX_FILE_SIZE = 25 * 1024 * 1024;
const PRIVATE_KEY_PATTERN = /^0x[0-9a-fA-F]{64}$/;

export type EncryptedFilePayload = {
  encryptedFile: string;
  encryptedAesKey: string;
  fileName: string;
};

export function validateUploadFile(file: File) {
  if (file.size === 0) throw new Error("The selected file is empty.");
  if (file.size > MAX_FILE_SIZE) throw new Error("Files must be 25 MB or smaller.");
  if (!file.name.trim() || file.name.length > 180) throw new Error("The file name is invalid or too long.");
}

export function validatePrivateKey(value: string) {
  if (!PRIVATE_KEY_PATTERN.test(value.trim())) {
    throw new Error("The private key must be a 32-byte hexadecimal key starting with 0x.");
  }
}

export function parseEncryptedFilePayload(value: unknown): EncryptedFilePayload {
  if (!value || typeof value !== "object") throw new Error("IPFS payload is not an object.");
  const payload = value as Record<string, unknown>;
  if (
    typeof payload.encryptedFile !== "string" ||
    !payload.encryptedFile ||
    typeof payload.encryptedAesKey !== "string" ||
    !payload.encryptedAesKey ||
    typeof payload.fileName !== "string" ||
    !payload.fileName.trim()
  ) {
    throw new Error("IPFS payload is missing required encrypted file fields.");
  }
  return {
    encryptedFile: payload.encryptedFile,
    encryptedAesKey: payload.encryptedAesKey,
    fileName: payload.fileName,
  };
}