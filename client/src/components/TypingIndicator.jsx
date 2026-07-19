import styles from "./TypingIndicator.module.css";

function TypingIndicator({ typingUsers }) {
  if (!typingUsers || typingUsers.length === 0) return null;

  const label =
    typingUsers.length === 1
      ? `${typingUsers[0]} is typing`
      : `${typingUsers.slice(0, 2).join(", ")}${typingUsers.length > 2 ? " and others" : ""} are typing`;

  return (
    <div className={styles.wrap}>
      <span className={styles.bars}>
        <span className={styles.bar} />
        <span className={styles.bar} />
        <span className={styles.bar} />
      </span>
      {label}
    </div>
  );
}

export default TypingIndicator;