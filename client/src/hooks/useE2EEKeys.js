import { useEffect, useState, useRef } from "react";
import { generateKeyPair, exportPrivateKey, importPrivateKey, exportPublicKey } from "../lib/e2ee";
import { getStoredPrivateKeyJwk, storePrivateKeyJwk, hasStoredPrivateKey } from "../lib/keyStore";
import { api } from "../lib/api";

// Call this once per logged-in session (e.g. from DirectMessages.jsx on
// mount). It guarantees:
// 1. This browser has an ECDH private key for `username` (generating one
//    the first time this browser is used for this account).
// 2. Your server's stored public key matches whatever private key is
//    sitting in this browser right now.
//
// Returns the imported CryptoKey ready to use with deriveSharedKey(), plus
// a `ready` flag so callers can wait before trying to encrypt/decrypt.
export function useE2EEKeys(username) {
  const [privateKey, setPrivateKey] = useState(null);
  const [ready, setReady] = useState(false);
  const didRun = useRef(false);

  useEffect(() => {
    if (!username || didRun.current) return;
    didRun.current = true;

    (async () => {
      try {
        let jwk = getStoredPrivateKeyJwk(username);
        let needsUpload = false;

        if (!jwk) {
          const keyPair = await generateKeyPair();
          jwk = await exportPrivateKey(keyPair.privateKey);
          storePrivateKeyJwk(username, jwk);
          needsUpload = true;
        }

        const importedPrivateKey = await importPrivateKey(jwk);
        setPrivateKey(importedPrivateKey);

        if (needsUpload) {
          // An EC private JWK is just the public JWK plus the `d` component
          // (the private scalar). Stripping `d` gives us the public JWK
          // directly, no need to regenerate or re-derive anything.
          const publicJwk = { ...jwk };
          delete publicJwk.d;
          publicJwk.key_ops = [];

          const publicKey = await crypto.subtle.importKey(
            "jwk",
            publicJwk,
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
          );
          const publicKeyString = await exportPublicKey(publicKey);
          await api.setPublicKey(publicKeyString);
        }

        setReady(true);
      } catch (err) {
        console.error("E2EE key setup failed:", err.message);
      }
    })();
  }, [username]);

  return { privateKey, ready, hasKey: username ? hasStoredPrivateKey(username) : false };
}