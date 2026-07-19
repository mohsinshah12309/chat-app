import { useRef, useState } from "react";
import EmojiPicker, { computeEmojiPickerPosition } from "./EmojiPicker";
import AudioMessage from "./AudioMessage";
import styles from "./MessageBubble.module.css";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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

function MessageBubble({ message, currentUsername, onReact, onReply }) {
  const { id, username, text, type, audioUrl, duration, timestamp, own, reactions, replyTo, pending, failed } = message;
  const [pickerPosition, setPickerPosition] = useState(null);
  const reactTriggerRef = useRef(null);

  const reactionGroups = groupReactions(reactions, currentUsername);
  const hasReactions = Object.keys(reactionGroups).length > 0;
  const isVoice = type === "voice";

  const handleToggleReactPicker = () => {
    if (pickerPosition) {
      setPickerPosition(null);
      return;
    }
    const rect = reactTriggerRef.current.getBoundingClientRect();
    setPickerPosition(computeEmojiPickerPosition(rect));
  };

  return (
    <div className={`${styles.row} ${own ? styles.rowOwn : ""}`}>
      <div className={styles.bubbleWrap}>
        <div className={`${styles.bubble} ${own ? styles.bubbleOwn : styles.bubbleOther} ${pending ? styles.bubblePending : ""}`}>
          {!own && <span className={styles.sender}>{username}</span>}

          {replyTo && (
            <div className={styles.replyPreview}>
              <span className={styles.replyAuthor}>{replyTo.username}</span>
              <span className={styles.replyText}>{replyTo.text}</span>
            </div>
          )}

          {isVoice ? (
            <AudioMessage src={audioUrl} duration={duration} />
          ) : (
            <span className={styles.text}>{text}</span>
          )}

          <span className={styles.metaRow}>
            <span className={styles.time}>{formatTime(timestamp)}</span>
            {failed && <span className={styles.status} aria-label="Failed to send">⚠️</span>}
            {own && !failed && (
              <span className={styles.status} aria-label={pending ? "Sending" : "Sent"}>
                {pending ? "🕓" : "✓"}
              </span>
            )}
          </span>

          <div className={styles.hoverActions}>
            <button
              ref={reactTriggerRef}
              type="button"
              className={styles.actionBtn}
              aria-label="React"
              disabled={pending}
              onClick={handleToggleReactPicker}
            >
              🙂+
            </button>
            <button
              type="button"
              className={styles.actionBtn}
              aria-label="Reply"
              disabled={pending}
              onClick={() => onReply({ id, username, text: isVoice ? "🎤 Voice note" : text })}
            >
              ↩
            </button>
          </div>

          {pickerPosition && (
            <EmojiPicker
              position={pickerPosition}
              onClose={() => setPickerPosition(null)}
              onSelect={(emoji) => onReact(id, emoji)}
            />
          )}
        </div>

        {hasReactions && (
          <div className={`${styles.reactionsBar} ${own ? styles.reactionsBarOwn : ""}`}>
            {Object.entries(reactionGroups).map(([emoji, { count, reactedByMe }]) => (
              <button
                key={emoji}
                type="button"
                className={`${styles.reactionPill} ${reactedByMe ? styles.reactionPillActive : ""}`}
                onClick={() => onReact(id, emoji)}
              >
                {emoji} {count > 1 ? count : ""}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default MessageBubble;