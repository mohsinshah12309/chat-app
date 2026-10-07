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
  const activeUserRef = useRef(null);

  useEffect(() => {
    if (!username) {
      setPrivateKey(null);
      setReady(false);
      activeUserRef.current = null;
      return;
    }

    if (activeUserRef.current === username) return;
    activeUserRef.current = username;
    setReady(false);

    (async () => {
      try {
        let jwk = getStoredPrivateKeyJwk(username);
        let publicKeyString = null;

        if (!jwk) {
          const keyPair = await generateKeyPair();
          jwk = await exportPrivateKey(keyPair.privateKey);
          storePrivateKeyJwk(username, jwk);
          publicKeyString = await exportPublicKey(keyPair.publicKey);
        } else {
          // Derive public key from stored private JWK
          const publicJwk = {
            kty: jwk.kty || "EC",
            crv: jwk.crv || "P-256",
            x: jwk.x,
            y: jwk.y,
            ext: true,
          };
          const pubKey = await crypto.subtle.importKey(
            "jwk",
            publicJwk,
            { name: "ECDH", namedCurve: "P-256" },
            true,
            []
          );
          publicKeyString = await exportPublicKey(pubKey);
        }

        const importedPrivateKey = await importPrivateKey(jwk);
        setPrivateKey(importedPrivateKey);

        // Always ensure the server has this browser's matching public key in MongoDB
        if (publicKeyString) {
          try {
            await api.setPublicKey(publicKeyString);
          } catch (uploadErr) {
            console.warn("Could not sync public key to server:", uploadErr.message);
          }
        }

        setReady(true);
      } catch (err) {
        console.error("E2EE key setup failed:", err.message);
      }
    })();
  }, [username]);

  return { privateKey, ready, hasKey: username ? hasStoredPrivateKey(username) : false };
}