import { useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import styles from "./AdminPanel.module.css";

function AdminPanel() {
  const [rooms, setRooms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busyRoom, setBusyRoom] = useState(null);
  const [confirmRoom, setConfirmRoom] = useState(null); // room pending "purge messages" confirm
  const [deleteConfirmRoom, setDeleteConfirmRoom] = useState(null); // room pending "delete room" confirm
  const [error, setError] = useState("");

  const [newRoomName, setNewRoomName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setRooms(await api.getAdminRooms());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleClear = async (room) => {
    setBusyRoom(room);
    try {
      await api.clearRoomMessages(room);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyRoom(null);
      setConfirmRoom(null);
    }
  };

  const handleCreateRoom = async (e) => {
    e.preventDefault();
    const name = newRoomName.trim();
    if (!name) return;

    setCreating(true);
    setError("");
    try {
      await api.createRoom(name);
      setNewRoomName("");
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteRoom = async (room) => {
    setBusyRoom(room);
    setError("");
    try {
      await api.deleteRoom(room);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyRoom(null);
      setDeleteConfirmRoom(null);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.header}>
        <h1 className={styles.title}>Control room</h1>
        <p className={styles.subtitle}>Monitor live channels and purge transmissions.</p>
        <button className={styles.refresh} onClick={load} disabled={loading}>
          {loading ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {error && <div className={styles.error}>{error}</div>}

      <form className={styles.createRow} onSubmit={handleCreateRoom}>
        <input
          className={styles.createInput}
          type="text"
          placeholder="New room name…"
          value={newRoomName}
          onChange={(e) => setNewRoomName(e.target.value)}
          maxLength={30}
        />
        <button className={styles.createBtn} type="submit" disabled={creating || !newRoomName.trim()}>
          {creating ? "Creating…" : "Create room"}
        </button>
      </form>

      <div className={styles.grid}>
        {rooms.map((r) => (
          <div key={r.room} className={styles.card}>
            <div className={styles.cardTop}>
              <span className={styles.pulseDot} />
              <span className={styles.roomName}>{r.room}</span>
            </div>

            <div className={styles.stats}>
              <div className={styles.stat}>
                <span className={styles.statValue}>{r.onlineCount}</span>
                <span className={styles.statLabel}>online</span>
              </div>
              <div className={styles.stat}>
                <span className={styles.statValue}>{r.messageCount}</span>
                <span className={styles.statLabel}>messages</span>
              </div>
            </div>

            {confirmRoom === r.room ? (
              <div className={styles.confirmRow}>
                <button
                  className={styles.confirmBtn}
                  disabled={busyRoom === r.room}
                  onClick={() => handleClear(r.room)}
                >
                  {busyRoom === r.room ? "Purging…" : "Confirm purge"}
                </button>
                <button className={styles.cancelBtn} onClick={() => setConfirmRoom(null)}>
                  Cancel
                </button>
              </div>
            ) : deleteConfirmRoom === r.room ? (
              <div className={styles.confirmRow}>
                <button
                  className={styles.deleteConfirmBtn}
                  disabled={busyRoom === r.room}
                  onClick={() => handleDeleteRoom(r.room)}
                >
                  {busyRoom === r.room ? "Deleting…" : "Confirm delete room"}
                </button>
                <button className={styles.cancelBtn} onClick={() => setDeleteConfirmRoom(null)}>
                  Cancel
                </button>
              </div>
            ) : (
              <div className={styles.actionRow}>
                <button className={styles.clearBtn} onClick={() => setConfirmRoom(r.room)}>
                  Purge transmission
                </button>
                <button className={styles.deleteBtn} onClick={() => setDeleteConfirmRoom(r.room)}>
                  Delete room
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default AdminPanel;