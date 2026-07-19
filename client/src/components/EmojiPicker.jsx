import { createPortal } from "react-dom";
import { useEffect, useRef } from "react";
import styles from "./EmojiPicker.module.css";

const EMOJI_GROUPS = {
  Smileys: ["😀", "😂", "😅", "😊", "😍", "🥰", "😘", "😜", "🤔", "😎", "😴", "🥳", "😭", "😡", "🤯", "🥺"],
  Gestures: ["👍", "👎", "👏", "🙏", "🙌", "🤝", "💪", "👊", "✌️", "🤞", "👋", "🤙"],
  Hearts: ["❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "💔", "💯", "✨"],
  Objects: ["🔥", "🎉", "🎂", "☕", "🍕", "⚡", "🌟", "🚀", "📌", "💡", "⏰", "🎧"],
};

const PICKER_WIDTH = 260;
const PICKER_MAX_HEIGHT = 240;
const VIEWPORT_MARGIN = 12;

// Given the react-button's DOMRect (from getBoundingClientRect() at click
// time), return { top, left } clamped inside the viewport. Exported so
// MessageBubble.jsx / DirectMessages.jsx compute this once, at the moment
// of the click, instead of the picker measuring itself after mounting.
export function computeEmojiPickerPosition(rect) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;

  const spaceAbove = rect.top;
  const openBelow = spaceAbove < PICKER_MAX_HEIGHT + VIEWPORT_MARGIN;

  let left = rect.right - PICKER_WIDTH;
  left = Math.max(VIEWPORT_MARGIN, Math.min(left, viewportWidth - PICKER_WIDTH - VIEWPORT_MARGIN));

  let top = openBelow
    ? Math.min(rect.bottom + 6, viewportHeight - PICKER_MAX_HEIGHT - VIEWPORT_MARGIN)
    : rect.top - PICKER_MAX_HEIGHT - 6;

  // Never let it go negative/off the top, regardless of which branch above ran.
  top = Math.max(VIEWPORT_MARGIN, top);

  return { top, left };
}

// `position` is computed by the caller at click time (see MessageBubble.jsx /
// DirectMessages.jsx) and passed straight in — no internal measurement, no
// ref timing, no effect race. { top, left } in viewport pixels.
function EmojiPicker({ onSelect, onClose, position }) {
  const pickerRef = useRef(null);

  useEffect(() => {
    function handleClick(e) {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose();
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  useEffect(() => {
    function handleScroll() {
      onClose();
    }
    window.addEventListener("scroll", handleScroll, true);
    return () => window.removeEventListener("scroll", handleScroll, true);
  }, [onClose]);

  if (!position) return null;

  return createPortal(
    <div
      className={styles.picker}
      ref={pickerRef}
      style={{ top: position.top, left: position.left }}
    >
      {Object.entries(EMOJI_GROUPS).map(([label, emojis]) => (
        <div key={label} className={styles.group}>
          <div className={styles.groupLabel}>{label}</div>
          <div className={styles.grid}>
            {emojis.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className={styles.emojiBtn}
                onClick={() => {
                  onSelect(emoji);
                  onClose();
                }}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>,
    document.body
  );
}

export default EmojiPicker;