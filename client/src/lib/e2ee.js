// End-to-end encryption for DMs, built on the browser's native Web Crypto
// API (no external crypto library needed).
//
// How it works:
// 1. Each user generates an ECDH keypair (curve P-256) once per browser.
// 2. Only the PUBLIC key ever leaves the browser (uploaded to the server).
// 3. To message someone, you derive a shared AES-GCM key from YOUR private
//    key + THEIR public key. Thanks to how Diffie-Hellman works, they derive
//    the exact same shared key from THEIR private key + YOUR public key —
//    without either of you ever transmitting the shared key itself.
// 4. The server only ever stores/relays ciphertext. It has no way to
//    decrypt messages, even with full database access.

const CURVE = "P-256";

export async function generateKeyPair() {
  return crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: CURVE },
    true, // extractable — we need to export the private key to store it locally
    ["deriveKey"]
  );
}

// Private key is stored locally (see keyStore.js) as a JWK so it survives
// page reloads within the same browser.
export async function exportPrivateKey(privateKey) {
  return crypto.subtle.exportKey("jwk", privateKey);
}

export async function importPrivateKey(jwk) {
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: CURVE },
    true,
    ["deriveKey"]
  );
}

// Public key is uploaded to the server as a JWK, JSON-stringified, so it can
// sit in a plain String field on the User model.
export async function exportPublicKey(publicKey) {
  const jwk = await crypto.subtle.exportKey("jwk", publicKey);
  return JSON.stringify(jwk);
}

export async function importPublicKey(jwkString) {
  const jwk = JSON.parse(jwkString);
  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDH", namedCurve: CURVE },
    true,
    [] // a public key is only ever used as the "other party" in deriveKey, no usages of its own
  );
}

// Derives an AES-GCM key directly from an ECDH keypair — this is the shared
// secret both conversation participants independently arrive at.
export async function deriveSharedKey(myPrivateKey, theirPublicKey) {
  return crypto.subtle.deriveKey(
    { name: "ECDH", public: theirPublicKey },
    myPrivateKey,
    { name: "AES-GCM", length: 256 },
    false, // not extractable — the shared key never needs to leave this derivation
    ["encrypt", "decrypt"]
  );
}

function toBase64(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function fromBase64(base64) {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

// Returns { cipherText, iv } — both base64 strings, safe to store as plain
// String fields in MongoDB and send over Socket.io as JSON.
export async function encryptText(sharedKey, plaintext) {
  const iv = crypto.getRandomValues(new Uint8Array(12)); // AES-GCM standard IV size
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertextBuffer = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    sharedKey,
    encoded
  );

  return {
    cipherText: toBase64(ciphertextBuffer),
    iv: toBase64(iv),
  };
}

export async function decryptText(sharedKey, cipherText, iv) {
  const ciphertextBuffer = fromBase64(cipherText);
  const ivBuffer = fromBase64(iv);

  const decryptedBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBuffer },
    sharedKey,
    ciphertextBuffer
  );

  return new TextDecoder().decode(decryptedBuffer);
}