import { useEffect, useState, useCallback, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { socket } from "../socket";
import { api } from "../lib/api";
import { useE2EEKeys } from "../hooks/useE2EEKeys";
import { importPublicKey, deriveSharedKey, encryptText, decryptText } from "../lib/e2ee";
import EmojiPicker, { computeEmojiPickerPosition } from "./EmojiPicker";
import VoiceRecorder from "./VoiceRecorder";
import AudioMessage from "./AudioMessage";
import styles from "./DirectMessages.module.css";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function sortByRecent(list) {
  return [...list].sort((a, b) => new Date(b.lastTimestamp) - new Date(a.lastTimestamp));
}

function groupReactions(reactions, currentUsername) {
  const groups = {};
  for (const r of reactions || []) {
    if (!groups[r.emoji]) groups[r.emoji] = { count: 0, reactedByMe: false };
    groups[r.emoji].count += 1;
    if (r.username === currentUsername) groups[r.emoji].reactedByMe = true;
  }
  return groups;
}

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function MessageTicks({ delivered, read }) {
  if (read) return <span className={`${styles.ticks} ${styles.ticksRead}`}>✓✓</span>;
  if (delivered) return <span className={styles.ticks}>✓✓</span>;
  return <span className={styles.ticks}>✓</span>;
}

// Mirrors the exact toggle logic the server uses (see dmHandlers.js /
// rooms.js): no reaction from this user yet -> add it; same emoji again ->
// remove it; different emoji -> replace it. Applying this identical logic
// locally means our optimistic update matches what the server will
// broadcast back, so there's no visible "flicker" when the real
// dm:reaction_update arrives to reconcile it.
function toggleReactionLocally(reactions, username, emoji) {
  const list = reactions || [];
  const idx = list.findIndex((r) => r.username === username);

  if (idx === -1) {
    return [...list, { username, emoji }];
  }
  if (list[idx].emoji === emoji) {
    return list.filter((_, i) => i !== idx);
  }
  return list.map((r, i) => (i === idx ? { ...r, emoji } : r));
}

function DirectMessages() {
  const { username } = useAuth();
  const { privateKey, ready: e2eeReady } = useE2EEKeys(username);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [conversations, setConversations] = useState([]);
  const [activePartner, setActivePartner] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loadingInbox, setLoadingInbox] = useState(true);
  const [deleteConfirmPartner, setDeleteConfirmPartner] = useState(null);
  const [deletingPartner, setDeletingPartner] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [openPicker, setOpenPicker] = useState(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [rateLimitWarning, setRateLimitWarning] = useState("");

  const activePartnerRef = useRef(null);
  useEffect(() => { activePartnerRef.current = activePartner; }, [activePartner]);

  const publicKeyCacheRef = useRef(new Map());
  const sharedKeyPromiseCacheRef = useRef(new Map()); // username -> Promise<CryptoKey>

  // Invalidate cached shared keys whenever our privateKey changes
  useEffect(() => {
    sharedKeyPromiseCacheRef.current.clear();
  }, [privateKey]);

  const getSharedKeyForPartner = useCallback((partner) => {
    if (!partner) return Promise.resolve(null);

    if (sharedKeyPromiseCacheRef.current.has(partner)) {
      return sharedKeyPromiseCacheRef.current.get(partner);
    }

    const promise = (async () => {
      if (!privateKey) {
        throw new Error("Private key not ready yet");
      }

      let publicKeyString = publicKeyCacheRef.current.get(partner);
      if (!publicKeyString) {
        const res = await api.getPublicKey(partner);
        publicKeyString = res.publicKey;
        if (!publicKeyString) {
          throw new Error(`User ${partner} has not uploaded an encryption key yet.`);
        }
        publicKeyCacheRef.current.set(partner, publicKeyString);
      }

      const theirPublicKey = await importPublicKey(publicKeyString);
      return await deriveSharedKey(privateKey, theirPublicKey);
    })();

    // On failure, delete from cache so retries can succeed
    promise.catch(() => {
      sharedKeyPromiseCacheRef.current.delete(partner);
    });

    sharedKeyPromiseCacheRef.current.set(partner, promise);
    return promise;
  }, [privateKey]);

  const decryptMessage = useCallback(async (msg, partner) => {
    if (!msg || msg.type !== "text") return msg;
    if (!msg.text || !msg.iv) return msg;

    try {
      const sharedKey = await getSharedKeyForPartner(partner);
      if (!sharedKey) throw new Error("Encryption key unavailable.");
      const plaintext = await decryptText(sharedKey, msg.text, msg.iv);

      let replyTo = msg.replyTo;
      if (replyTo && replyTo.text && replyTo.iv) {
        try {
          const replyPlaintext = await decryptText(sharedKey, replyTo.text, replyTo.iv);
          replyTo = { ...replyTo, text: replyPlaintext };
        } catch {
          replyTo = { ...replyTo, text: "🔒 Unable to decrypt" };
        }
      }

      return {
        ...msg,
        text: plaintext,
        replyTo,
        rawCipher: msg.text,
        rawIv: msg.iv,
        decrypted: true,
      };
    } catch (err) {
      console.warn("Failed to decrypt message:", err.message);
      return {
        ...msg,
        text: "🔒 Unable to decrypt this message",
        rawCipher: msg.text,
        rawIv: msg.iv,
        decrypted: false,
      };
    }
  }, [getSharedKeyForPartner]);

  // If keys become ready later, re-decrypt any pending undecrypted messages
  useEffect(() => {
    if (!e2eeReady || !privateKey || !activePartner) return;

    setMessages((prev) => {
      const hasUndecrypted = prev.some((m) => m.type === "text" && m.decrypted === false && m.rawCipher && m.rawIv);
      if (!hasUndecrypted) return prev;

      (async () => {
        try {
          const sharedKey = await getSharedKeyForPartner(activePartner);
          if (!sharedKey) return;

          const updated = await Promise.all(
            prev.map(async (m) => {
              if (m.type === "text" && m.decrypted === false && m.rawCipher && m.rawIv) {
                try {
                  const plaintext = await decryptText(sharedKey, m.rawCipher, m.rawIv);
                  return { ...m, text: plaintext, decrypted: true };
                } catch {
                  return m;
                }
              }
              return m;
            })
          );
          setMessages(updated);
        } catch (err) {
          console.warn("Re-decrypt effect failed:", err.message);
        }
      })();

      return prev;
    });
  }, [e2eeReady, privateKey, activePartner, getSharedKeyForPartner]);

  const endRef = useRef(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: hasMounted.current ? "smooth" : "auto" });
    hasMounted.current = true;
  }, [messages]);

  useEffect(() => {
    hasMounted.current = false;
  }, [activePartner]);

  useEffect(() => {
    if (!socket.connected) socket.connect();
    (async () => {
      try {
        const inbox = await api.getInbox();
        setConversations(
          sortByRecent(
            inbox.map((c) => ({
              ...c,
              lastText: c.lastText
                ? c.lastText.startsWith("🎤")
                  ? c.lastText
                  : "🔒 Encrypted message"
                : "",
              unread: false,
            }))
          )
        );
      } catch {
        // ignore
      } finally {
        setLoadingInbox(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    const timeout = setTimeout(async () => {
      try {
        setResults(await api.searchUsers(query.trim()));
      } catch { /* ignore */ }
    }, 300);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => {
    async function onReceive(msg) {
      const partner = msg.from === username ? msg.to : msg.from;
      const isOpen = activePartnerRef.current === partner;

      setConversations((prev) => {
        const existing = prev.find((c) => c.partner === partner);
        const previewText = msg.type === "voice" ? "🎤 Voice note" : "🔒 Encrypted message";
        const updated = {
          partner,
          lastText: previewText,
          lastFrom: msg.from,
          lastTimestamp: msg.timestamp,
          unread: existing ? (isOpen ? false : true) : msg.from !== username,
        };
        const rest = prev.filter((c) => c.partner !== partner);
        return sortByRecent([updated, ...rest]);
      });

      if (isOpen) {
        const decrypted = await decryptMessage(msg, partner);

        setMessages((prev) => {
          if (msg.tempId) {
            const idx = prev.findIndex((m) => m.tempId === msg.tempId);
            if (idx !== -1) {
              const old = prev[idx];
              if (old.audioUrl?.startsWith("blob:")) URL.revokeObjectURL(old.audioUrl);
              const updated = [...prev];
              const finalText =
                decrypted.text === "🔒 Unable to decrypt this message" && old.text
                  ? old.text
                  : decrypted.text;
              updated[idx] = { ...decrypted, text: finalText, pending: false };
              return updated;
            }
          }
          return [...prev, decrypted];
        });
      }

      if (msg.to === username) {
        socket.emit("dm:ack_delivered", { messageId: msg.id });
        if (isOpen) {
          socket.emit("dm:mark_read", { partner: msg.from });
        }
      }
    }

    function onReactionUpdate({ messageId, reactions }) {
      setMessages((prev) =>
        prev.map((m) => (String(m.id) === String(messageId) ? { ...m, reactions } : m))
      );
    }

    function onStatusUpdate({ messageIds, delivered, read }) {
      setMessages((prev) =>
        prev.map((m) =>
          messageIds.includes(String(m.id))
            ? { ...m, delivered: delivered ?? m.delivered, read: read ?? m.read }
            : m
        )
      );
    }

    function onRateLimited({ message }) {
      setRateLimitWarning(message);
      setTimeout(() => setRateLimitWarning(""), 3000);
    }

    socket.on("dm:receive", onReceive);
    socket.on("dm:reaction_update", onReactionUpdate);
    socket.on("dm:status_update", onStatusUpdate);
    socket.on("rate_limited", onRateLimited);
    return () => {
      socket.off("dm:receive", onReceive);
      socket.off("dm:reaction_update", onReactionUpdate);
      socket.off("dm:status_update", onStatusUpdate);
      socket.off("rate_limited", onRateLimited);
    };
  }, [username, decryptMessage]);

  const openConversation = useCallback(async (partner) => {
    setActivePartner(partner);
    setResults([]);
    setQuery("");
    setReplyingTo(null);
    setSidebarOpen(false);
    setMessages([]);

    setConversations((prev) => {
      const existing = prev.find((c) => c.partner === partner);
      const entry = existing
        ? { ...existing, unread: false }
        : { partner, lastText: "", lastFrom: "", lastTimestamp: new Date().toISOString(), unread: false };
      const rest = prev.filter((c) => c.partner !== partner);
      return sortByRecent([entry, ...rest]);
    });

    try {
      const history = await api.getDmHistory(partner);
      const decrypted = await Promise.all(history.map((m) => decryptMessage(m, partner)));
      setMessages(decrypted);
    } catch {
      setMessages([]);
    }

    socket.emit("dm:mark_read", { partner });
  }, [decryptMessage]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!draft.trim() || !activePartner || !e2eeReady) return;

    const partner = activePartner;
    const plaintext = draft.trim();
    const currentReply = replyingTo;
    const tempId = `temp-${nowId()}`;

    // Render immediately with the plaintext we already have (no need to
    // wait for encryption/round-trip to show our own message) — this is
    // exactly the optimistic pattern rooms already use, just missing here
    // before now. Encryption + the actual send happen in the background.
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        tempId,
        from: username,
        to: partner,
        type: "text",
        text: plaintext,
        replyTo: currentReply,
        reactions: [],
        delivered: false,
        read: false,
        timestamp: new Date().toISOString(),
        pending: true,
      },
    ]);
    setDraft("");
    setReplyingTo(null);

    // Ensure socket is connected before emitting
    if (!socket.connected) socket.connect();

    try {
      const sharedKey = await getSharedKeyForPartner(partner);
      if (!sharedKey) {
        throw new Error("Could not establish an encryption key for this conversation yet.");
      }

      const { cipherText, iv } = await encryptText(sharedKey, plaintext);

      let encryptedReplyTo = null;
      if (currentReply) {
        const replyEncrypted = await encryptText(sharedKey, currentReply.text);
        encryptedReplyTo = {
          id: currentReply.id,
          username: currentReply.username,
          text: replyEncrypted.cipherText,
          iv: replyEncrypted.iv,
        };
      }

      socket.emit(
        "dm:send",
        { to: partner, text: cipherText, iv, replyTo: encryptedReplyTo, tempId },
        (res) => {
          if (res?.success) {
            setMessages((prev) =>
              prev.map((m) =>
                m.tempId === tempId
                  ? { ...m, ...(res.message || {}), text: plaintext, pending: false }
                  : m
              )
            );
          } else {
            setMessages((prev) =>
              prev.map((m) => (m.tempId === tempId ? { ...m, pending: false, failed: true } : m))
            );
            setRateLimitWarning(res?.message || "Message failed to send.");
            setTimeout(() => setRateLimitWarning(""), 4000);
          }
        }
      );
    } catch (err) {
      console.error("Failed to encrypt/send message:", err);
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...m, pending: false, failed: true } : m))
      );
      setRateLimitWarning(`Send failed: ${err.message}`);
      setTimeout(() => setRateLimitWarning(""), 5000);
    }
  };

  const handleSendVoice = async (blob) => {
    if (!activePartner) return;
    setIsRecording(false);

    const tempId = `temp-${nowId()}`;
    const localUrl = URL.createObjectURL(blob);
    const partner = activePartner;

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        tempId,
        from: username,
        to: partner,
        type: "voice",
        text: "",
        audioUrl: localUrl,
        duration: null,
        replyTo: replyingTo || null,
        reactions: [],
        delivered: false,
        read: false,
        timestamp: new Date().toISOString(),
        pending: true,
      },
    ]);
    setReplyingTo(null);

    try {
      const { url, duration } = await api.uploadVoiceNote(blob);
      socket.emit(
        "dm:send",
        { to: partner, type: "voice", audioUrl: url, duration, replyTo: null, tempId },
        (res) => {
          if (!res?.success) {
            setMessages((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, pending: false, failed: true } : m)));
          }
        }
      );
    } catch (err) {
      console.error("Voice note upload failed:", err.message);
      setMessages((prev) => prev.map((m) => (m.tempId === tempId ? { ...m, pending: false, failed: true } : m)));
    }
  };

  // Mirrors the server's toggle logic exactly (rooms.js / dmHandlers.js):
  // no existing reaction from this user -> add it; same emoji again ->
  // remove it; different emoji -> replace it. Used to update the UI
  // instantly instead of waiting for the server's broadcast to come back.
  const toggleReactionLocally = (reactions, emoji) => {
    const idx = reactions.findIndex((r) => r.username === username);
    if (idx === -1) return [...reactions, { username, emoji }];
    if (reactions[idx].emoji === emoji) return reactions.filter((_, i) => i !== idx);
    const updated = [...reactions];
    updated[idx] = { username, emoji };
    return updated;
  };

  const handleReact = (messageId, emoji) => {
    if (!activePartner) return;

    // Optimistic: update the reaction locally right away. The server's
    // dm:reaction_update broadcast will arrive shortly after and overwrite
    // this with the authoritative version — harmless even if it's identical.
    setMessages((prev) =>
      prev.map((m) =>
        String(m.id) === String(messageId)
          ? { ...m, reactions: toggleReactionLocally(m.reactions || [], username, emoji) }
          : m
      )
    );

    socket.emit("dm:react", { messageId, emoji, to: activePartner });
  };

  const handleToggleReactPicker = (messageId, buttonEl) => {
    if (openPicker?.messageId === messageId) {
      setOpenPicker(null);
      return;
    }
    const rect = buttonEl.getBoundingClientRect();
    setOpenPicker({ messageId, position: computeEmojiPickerPosition(rect) });
  };

  const handleDeleteConversation = async (partner) => {
    setDeletingPartner(partner);
    try {
      await api.deleteConversation(partner);
      setConversations((prev) => prev.filter((c) => c.partner !== partner));
      if (activePartnerRef.current === partner) {
        setActivePartner(null);
        setMessages([]);
      }
    } catch {
      // keep it in the list, user can retry
    } finally {
      setDeletingPartner(null);
      setDeleteConfirmPartner(null);
    }
  };

  return (
    <div className={styles.wrap}>
      {sidebarOpen && <div className={styles.scrim} onClick={() => setSidebarOpen(false)} />}

      <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
        <div className={styles.searchBox}>
          <input
            className={styles.searchInput}
            placeholder="Search a username…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {results.length > 0 && (
            <ul className={styles.results}>
              {results.map((u) => (
                <li key={u}>
                  <button className={styles.resultItem} onClick={() => openConversation(u)}>{u}</button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className={styles.convHeader}>Conversations</div>
        <ul className={styles.convList}>
          {loadingInbox && <li className={styles.empty}>Loading…</li>}
          {!loadingInbox && conversations.length === 0 && (
            <li className={styles.empty}>Search a username to start.</li>
          )}
          {conversations.map((c) => (
            <li key={c.partner} className={styles.convListItem}>
              {deleteConfirmPartner === c.partner ? (
                <div className={styles.convDeleteConfirm}>
                  <span className={styles.convDeleteConfirmText}>Delete this chat?</span>
                  <button
                    className={styles.convDeleteConfirmBtn}
                    disabled={deletingPartner === c.partner}
                    onClick={() => handleDeleteConversation(c.partner)}
                  >
                    {deletingPartner === c.partner ? "Deleting…" : "Delete"}
                  </button>
                  <button className={styles.convDeleteCancelBtn} onClick={() => setDeleteConfirmPartner(null)}>
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <button
                    className={`${styles.convItem} ${activePartner === c.partner ? styles.convItemActive : ""}`}
                    onClick={() => openConversation(c.partner)}
                  >
                    <div className={styles.convItemTop}>
                      <span className={styles.convName}>{c.partner}</span>
                      {c.unread && <span className={styles.unreadDot} />}
                    </div>
                    {c.lastText && (
                      <span className={styles.convPreview}>
                        {c.unread ? "messaged you: " : ""}
                        {c.lastText}
                      </span>
                    )}
                  </button>
                  <button
                    className={styles.convDeleteTrigger}
                    aria-label={`Delete conversation with ${c.partner}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirmPartner(c.partner);
                    }}
                  >
                    🗑
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      </aside>

      <main className={styles.thread}>
        <div className={styles.mobileBar}>
          <button className={styles.mobileMenuBtn} onClick={() => setSidebarOpen(true)} aria-label="Open conversations">☰</button>
          <span className={styles.mobileBarTitle}>{activePartner || "Direct Messages"}</span>
        </div>

        {rateLimitWarning && <div className={styles.rateLimitBanner}>{rateLimitWarning}</div>}

        {!activePartner ? (
          <div className={styles.placeholder}>Pick or search someone to message.</div>
        ) : (
          <>
            <div className={styles.threadHeader}>
              {activePartner}
              <span className={styles.encryptedBadge} title="Messages in this conversation are end-to-end encrypted">
                🔒 Encrypted
              </span>
            </div>
            <div className={styles.messages}>
              {messages.map((m) => {
                const own = m.from === username;
                const isVoice = m.type === "voice";
                const reactionGroups = groupReactions(m.reactions, username);
                const hasReactions = Object.keys(reactionGroups).length > 0;

                return (
                  <div key={m.id} className={styles.bubbleWrap}>
                    <div className={`${styles.row} ${own ? styles.rowOwn : ""}`}>
                      <div className={`${styles.bubble} ${own ? styles.bubbleOwn : styles.bubbleOther} ${m.pending ? styles.bubblePending : ""}`}>
                        {m.replyTo && (
                          <div className={styles.replyPreview}>
                            <span className={styles.replyAuthor}>{m.replyTo.username}</span>
                            <span className={styles.replyText}>{m.replyTo.text}</span>
                          </div>
                        )}

                        {isVoice ? (
                          <AudioMessage src={m.audioUrl} duration={m.duration} />
                        ) : (
                          <span>{m.text}</span>
                        )}

                        <span className={styles.metaRow}>
                          <span className={styles.time}>{formatTime(m.timestamp)}</span>
                          {m.failed && <span className={styles.ticks} aria-label="Failed to send">⚠️</span>}
                          {own && !m.failed && (
                            m.pending
                              ? <span className={styles.ticks} aria-label="Sending">🕓</span>
                              : <MessageTicks delivered={m.delivered} read={m.read} />
                          )}
                        </span>

                        <div className={styles.hoverActions}>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            aria-label="React"
                            disabled={m.pending}
                            onClick={(e) => handleToggleReactPicker(m.id, e.currentTarget)}
                          >
                            🙂+
                          </button>
                          <button
                            type="button"
                            className={styles.actionBtn}
                            aria-label="Reply"
                            disabled={m.pending}
                            onClick={() => setReplyingTo({ id: m.id, username: m.from, text: isVoice ? "🎤 Voice note" : m.text })}
                          >
                            ↩
                          </button>
                        </div>

                        {openPicker?.messageId === m.id && (
                          <EmojiPicker
                            position={openPicker.position}
                            onClose={() => setOpenPicker(null)}
                            onSelect={(emoji) => handleReact(m.id, emoji)}
                          />
                        )}
                      </div>
                    </div>

                    {hasReactions && (
                      <div className={`${styles.reactionsBar} ${own ? styles.reactionsBarOwn : ""}`}>
                        {Object.entries(reactionGroups).map(([emoji, { count, reactedByMe }]) => (
                          <button
                            key={emoji}
                            type="button"
                            className={`${styles.reactionPill} ${reactedByMe ? styles.reactionPillActive : ""}`}
                            onClick={() => handleReact(m.id, emoji)}
                          >
                            {emoji} {count > 1 ? count : ""}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={endRef} />
            </div>

            {replyingTo && (
              <div className={styles.replyBar}>
                <div className={styles.replyBarText}>
                  <span className={styles.replyBarAuthor}>Replying to {replyingTo.username}</span>
                  <span className={styles.replyBarQuote}>{replyingTo.text}</span>
                </div>
                <button
                  type="button"
                  className={styles.replyBarCancel}
                  onClick={() => setReplyingTo(null)}
                  aria-label="Cancel reply"
                >
                  ✕
                </button>
              </div>
            )}

            {isRecording ? (
              <VoiceRecorder onRecorded={handleSendVoice} onCancel={() => setIsRecording(false)} />
            ) : (
              <form className={styles.inputBar} onSubmit={handleSend}>
                <input
                  className={styles.input}
                  placeholder={e2eeReady ? "Message…" : "Setting up encryption…"}
                  value={draft}
                  disabled={!e2eeReady}
                  onChange={(e) => setDraft(e.target.value)}
                />
                {draft.trim() ? (
                  <button className={styles.send} type="submit" disabled={!e2eeReady} aria-label="Send">▲</button>
                ) : (
                  <button
                    type="button"
                    className={styles.send}
                    disabled={!e2eeReady}
                    onClick={() => setIsRecording(true)}
                    aria-label="Record voice note"
                  >
                    🎤
                  </button>
                )}
              </form>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default DirectMessages;