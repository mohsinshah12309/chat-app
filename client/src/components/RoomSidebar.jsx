import styles from "./RoomSidebar.module.css";

function RoomSidebar({ rooms, activeRoom, onSwitch, open, onClose }) {
  return (
    <>
      {open && <div className={styles.scrim} onClick={onClose} />}
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ""}`}>
        <div className={styles.header}>Channels</div>
        <ul className={styles.list}>
          {rooms.map((r) => (
            <li key={r}>
              <button
                className={`${styles.roomBtn} ${r === activeRoom ? styles.roomBtnActive : ""}`}
                onClick={() => onSwitch(r)}
              >
                <span className={styles.bar} />
                {r}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </>
  );
}

export default RoomSidebar;