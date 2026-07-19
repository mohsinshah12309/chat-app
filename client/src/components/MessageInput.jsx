import { useRef, useState, useEffect } from "react";
import VoiceRecorder from "./VoiceRecorder";
import styles from "./MessageInput.module.css";

function MessageInput({ onSend, onSendVoice, onTyping, onStopTyping, replyingTo, onCancelReply }) {
  const [text, setText] = useState("");
  const [isRecording, setIsRecording] = useState(false);
  const typingTimeout = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (replyingTo) inputRef.current?.focus();
  }, [replyingTo]);

  const handleChange = (e) => {
    setText(e.target.value);
    onTyping();
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => onStopTyping(), 2000);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSend(text, replyingTo || null);
    setText("");
    onCancelReply?.();
    if (typingTimeout.current) clearTimeout(typingTimeout.current);
    onStopTyping();
  };

  const handleVoiceRecorded = (blob) => {
    setIsRecording(false);
    onSendVoice(blob, replyingTo || null);
    onCancelReply?.();
  };

  return (
    <div className={styles.wrap}>
      {replyingTo && (
        <div className={styles.replyBar}>
          <div className={styles.replyBarText}>
            <span className={styles.replyBarAuthor}>Replying to {replyingTo.username}</span>
            <span className={styles.replyBarQuote}>{replyingTo.text}</span>
          </div>
          <button type="button" className={styles.replyBarCancel} onClick={onCancelReply} aria-label="Cancel reply">
            ✕
          </button>
        </div>
      )}

      {isRecording ? (
        <VoiceRecorder onRecorded={handleVoiceRecorded} onCancel={() => setIsRecording(false)} />
      ) : (
        <form className={styles.bar} onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            className={styles.input}
            type="text"
            placeholder="Broadcast a message…"
            value={text}
            onChange={handleChange}
            autoComplete="off"
          />
          {text.trim() ? (
            <button className={styles.send} type="submit" aria-label="Send">▲</button>
          ) : (
            <button
              type="button"
              className={styles.micBtn}
              onClick={() => setIsRecording(true)}
              aria-label="Record voice note"
            >
              🎤
            </button>
          )}
        </form>
      )}
    </div>
  );
}

export default MessageInput;