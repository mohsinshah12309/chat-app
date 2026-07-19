import { useState } from "react";
import styles from "./JoinScreen.module.css";

const ROOM_LABELS = { General: "94.0", Random: "101.5", "Tech Talk": "107.9" };

function JoinScreen({ rooms, onJoin, error }) {
  const [selectedRoom, setSelectedRoom] = useState(rooms[0] || "");

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!selectedRoom) return;
    onJoin(selectedRoom);
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <h1 className={styles.title}>Pick a channel</h1>
        <p className={styles.subtitle}>Choose a room to start chatting.</p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <span className={styles.label}>Channel</span>
          <div className={styles.channelList}>
            {rooms.map((r) => (
              <button
                type="button"
                key={r}
                className={`${styles.channel} ${selectedRoom === r ? styles.channelActive : ""}`}
                onClick={() => setSelectedRoom(r)}
              >
                <span className={styles.channelFreq}>{ROOM_LABELS[r] || "--.-"}</span>
                <span className={styles.channelName}>{r}</span>
              </button>
            ))}
          </div>

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submit}>Enter room</button>
        </form>
      </div>
    </div>
  );
}

export default JoinScreen;