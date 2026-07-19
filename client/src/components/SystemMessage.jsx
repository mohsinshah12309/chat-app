import styles from "./SystemMessage.module.css";

function formatTime(ts) {
  return new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function SystemMessage({ text, timestamp }) {
  return (
    <div className={styles.wrap}>
      <span className={styles.line} />
      <span className={styles.text}>{text} · {formatTime(timestamp)}</span>
      <span className={styles.line} />
    </div>
  );
}

export default SystemMessage;