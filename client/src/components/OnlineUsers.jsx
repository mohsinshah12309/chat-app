import styles from "./OnlineUsers.module.css";

function OnlineUsers({ users, currentUser, open, onClose }) {
  return (
    <>
      {open && <div className={styles.scrim} onClick={onClose} />}
      <aside className={`${styles.panel} ${open ? styles.panelOpen : ""}`}>
        <div className={styles.header}>
          <span>On air</span>
          <span className={styles.count}>{users.length}</span>
        </div>
        <ul className={styles.list}>
          {users.map((u) => (
            <li key={u} className={styles.user}>
              <span className={styles.pulseDot} />
              <span className={u === currentUser ? styles.you : ""}>{u}</span>
              {u === currentUser && <span className={styles.youTag}>you</span>}
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}

export default OnlineUsers;