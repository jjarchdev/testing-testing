import {
  createCipheriv,
  createDecipheriv,
  hkdfSync,
  randomBytes,
  timingSafeEqual,
} from "crypto";

// AES-256-GCM at-rest encryption for Confluence tokens.
//
// Key preference:
//   1. CONFLUENCE_ENCRYPTION_KEY (32 raw bytes, base64 or hex, or any string >= 32 chars)
//   2. Derived from JWT_SECRET via HKDF (dev / single-secret setups)
//
// The derived form is fine when JWT_SECRET is strong; rotate it and stored tokens
// become undecryptable (users would just reconnect Confluence).

const KEY_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const HKDF_INFO = Buffer.from("qm-playbook:confluence:v1");
const HKDF_SALT = Buffer.from("qm-playbook:secrets:v1");

function decodeKeyMaterial(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  // hex
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, "hex");
  // base64 (32 bytes)
  try {
    const b = Buffer.from(s, "base64");
    if (b.length === KEY_LEN) return b;
  } catch {
    /* ignore */
  }
  // raw string long enough — hash-derive
  if (s.length >= KEY_LEN) {
    return Buffer.from(hkdfSync("sha256", Buffer.from(s), HKDF_SALT, HKDF_INFO, KEY_LEN));
  }
  return null;
}

let cachedKey = null;
let cachedSource = null;

function getEncryptionKey() {
  if (cachedKey) return cachedKey;
  const fromEnv = decodeKeyMaterial(process.env.CONFLUENCE_ENCRYPTION_KEY);
  if (fromEnv) {
    cachedKey = fromEnv;
    cachedSource = "env";
    return cachedKey;
  }
  const jwt = (process.env.JWT_SECRET || "").trim();
  if (jwt.length >= 16) {
    cachedKey = Buffer.from(hkdfSync("sha256", Buffer.from(jwt), HKDF_SALT, HKDF_INFO, KEY_LEN));
    cachedSource = "jwt";
    return cachedKey;
  }
  throw new Error(
    "Encryption key unavailable: set CONFLUENCE_ENCRYPTION_KEY (32 bytes hex/base64 or 32+ char string) or a strong JWT_SECRET"
  );
}

export function encryptionKeySource() {
  try {
    getEncryptionKey();
    return cachedSource;
  } catch {
    return "missing";
  }
}

/** Returns base64(iv || tag || ciphertext). */
export function encryptSecret(plaintext) {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const buf = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, buf]).toString("base64");
}

export function decryptSecret(payload) {
  if (!payload) return "";
  const key = getEncryptionKey();
  const raw = Buffer.from(String(payload), "base64");
  if (raw.length < IV_LEN + TAG_LEN + 1) throw new Error("Ciphertext too short");
  const iv = raw.subarray(0, IV_LEN);
  const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const data = raw.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const buf = Buffer.concat([decipher.update(data), decipher.final()]);
  return buf.toString("utf8");
}

/** Constant-time equality for two same-length strings. */
export function safeStringEquals(a, b) {
  const bufA = Buffer.from(String(a || ""), "utf8");
  const bufB = Buffer.from(String(b || ""), "utf8");
  if (bufA.length !== bufB.length) {
    // Still run a comparison to keep timing similar.
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

export function randomToken(bytes = 32) {
  return randomBytes(bytes).toString("base64url");
}
