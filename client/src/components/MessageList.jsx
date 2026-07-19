import { useEffect, useRef } from "react";
import MessageBubble from "./MessageBubble";
import SystemMessage from "./SystemMessage";
import TypingIndicator from "./TypingIndicator";
import styles from "./MessageList.module.css";

function MessageList({ messages, typingUsers, currentUsername, onReact, onReply }) {
  const endRef = useRef(null);
  const hasMounted = useRef(false);

  useEffect(() => {
    endRef.current?.scrollIntoView({
      behavior: hasMounted.current ? "smooth" : "auto",
    });
    hasMounted.current = true;
  }, [messages, typingUsers]);

  return (
    <div className={styles.list}>
      {messages.length === 0 && <div className={styles.empty}>No transmissions yet. Say something.</div>}
      {messages.map((m) =>
        m.kind === "system" ? (
          <SystemMessage key={m.id} text={m.text} timestamp={m.timestamp} />
        ) : (
          <MessageBubble
            key={m.id}
            message={m}
            currentUsername={currentUsername}
            onReact={onReact}
            onReply={onReply}
          />
        )
      )}
      <div className={styles.typingSlot}>
        <TypingIndicator typingUsers={typingUsers} />
      </div>
      <div ref={endRef} />
    </div>
  );
}

export default MessageList;