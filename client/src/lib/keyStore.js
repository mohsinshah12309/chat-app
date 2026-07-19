// Stores each user's ECDH private key (as JWK) in localStorage, scoped by
// username so switching accounts in the same browser doesn't mix up keys.
//
// IMPORTANT LIMITATION (worth knowing, and worth mentioning if asked):
// this key lives only in THIS browser's localStorage. Log into your account
// from a different browser or device, and it generates a brand new keypair
// there — meaning messages encrypted under the old public key can no longer
// be decrypted from the new device. Real E2E apps (Signal, WhatsApp) solve
// this with a device-linking/key-syncing protocol, which is well beyond the
// scope of a portfolio project. This tradeoff is standard for a simplified
// E2E implementation and is worth being upfront about in an interview.

const KEY_PREFIX = "e2ee_private_key_";

export function getStoredPrivateKeyJwk(username) {
  const raw = localStorage.getItem(KEY_PREFIX + username);
  return raw ? JSON.parse(raw) : null;
}

export function storePrivateKeyJwk(username, jwk) {
  localStorage.setItem(KEY_PREFIX + username, JSON.stringify(jwk));
}

export function hasStoredPrivateKey(username) {
  return localStorage.getItem(KEY_PREFIX + username) !== null;
}