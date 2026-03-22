/**
 * AES encryption helpers for all chat modules.
 *
 * Flow:
 * - Before INSERT: encryptMessage(plainText) -> store only encrypted text in DB
 * - After SELECT: decryptMessage(encryptedText) -> render plain text in UI
 *
 * Secret key must be provided via env var: NEXT_PUBLIC_CHAT_SECRET
 * (Expo fallback supported: EXPO_PUBLIC_CHAT_SECRET)
 */

import CryptoJS from "crypto-js";

const getChatSecret = () =>
  process.env.NEXT_PUBLIC_CHAT_SECRET || process.env.EXPO_PUBLIC_CHAT_SECRET;

let ivCounter = 0;

const deriveAesKey = (secret) => {
  // 256-bit key derived from the shared secret.
  return CryptoJS.SHA256(secret);
};

const buildIv = (secret) => {
  // Create a per-message IV without relying on native secure random APIs.
  ivCounter = (ivCounter + 1) % Number.MAX_SAFE_INTEGER;
  const ivSeed = `${secret}|${Date.now()}|${ivCounter}`;
  const ivHex = CryptoJS.SHA256(ivSeed).toString().slice(0, 32); // 16 bytes
  return CryptoJS.enc.Hex.parse(ivHex);
};

export const encryptMessage = (message) => {
  const secret = getChatSecret();
  if (!secret) {
    // Do NOT fallback to storing plaintext if the key is missing.
    throw new Error("Missing chat encryption secret (NEXT_PUBLIC_CHAT_SECRET)");
  }

  const plainText = typeof message === "string" ? message : String(message ?? "");
  const key = deriveAesKey(secret);
  const iv = buildIv(secret);
  const encrypted = CryptoJS.AES.encrypt(plainText, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  // Persist IV alongside ciphertext: <ivHex>:<base64Ciphertext>
  return `${iv.toString(CryptoJS.enc.Hex)}:${encrypted.toString()}`;
};

export const decryptMessage = (encryptedMessage) => {
  try {
    const secret = getChatSecret();
    if (!secret) return "Unable to decrypt message";

    if (encryptedMessage == null) return "";
    if (typeof encryptedMessage !== "string") encryptedMessage = String(encryptedMessage);
    if (!encryptedMessage) return "";

    const key = deriveAesKey(secret);
    let plainText = "";
    let didDecrypt = false;

    // New format: <ivHex>:<cipherText>
    if (encryptedMessage.includes(":")) {
      const parts = encryptedMessage.split(":");
      if (parts.length >= 2 && parts[0].length === 32) {
        const iv = CryptoJS.enc.Hex.parse(parts[0]);
        const cipherText = parts.slice(1).join(":");
        const bytes = CryptoJS.AES.decrypt(cipherText, key, {
          iv,
          mode: CryptoJS.mode.CBC,
          padding: CryptoJS.pad.Pkcs7,
        });
        plainText = bytes.toString(CryptoJS.enc.Utf8);
        didDecrypt = true;
      }
    }

    // Backward compatibility for previously stored passphrase-mode values.
    if (!didDecrypt) {
      const legacyBytes = CryptoJS.AES.decrypt(encryptedMessage, secret);
      plainText = legacyBytes.toString(CryptoJS.enc.Utf8);
      didDecrypt = true;
    }

    return didDecrypt ? plainText : "Unable to decrypt message";
  } catch {
    return "Unable to decrypt message";
  }
};
