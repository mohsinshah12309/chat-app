import { useState, useEffect } from "react";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { socket } from "./socket";
import AuthScreen from "./components/AuthScreen";
import JoinScreen from "./components/JoinScreen";
import ChatRoom from "./components/ChatRoom";
import DirectMessages from "./components/DirectMessages";
import AdminPanel from "./components/AdminPanel";
import useChatSocket from "./hooks/useChatSocket";
import { useE2EEKeys } from "./hooks/useE2EEKeys";
import "./index.css";

function Dashboard() {
  const { username, isAdmin, logout } = useAuth();
  // Ensure encryption keys and public key sync start immediately upon login
  useE2EEKeys(username);

  // Ensure socket is connected for real-time messaging even before entering a room
  useEffect(() => {
    if (username && !socket.connected) {
      socket.connect();
    }
  }, [username]);

  const [tab, setTab] = useState("rooms");
  const [joined, setJoined] = useState(false);
  const chat = useChatSocket();

  const handleJoin = (room) => {
    chat.join(username, room, (res) => {
      if (res.success) setJoined(true);
      else chat.setJoinError(res.message);
    });
  };

  return (
    <div className="dashboard">
      <nav className="topNav">
        <div className="topNavTabs">
          <button className={tab === "rooms" ? "navTabActive" : "navTab"} onClick={() => setTab("rooms")}>Rooms</button>
          <button className={tab === "dms" ? "navTabActive" : "navTab"} onClick={() => setTab("dms")}>Direct Messages</button>
          {isAdmin && (
            <button className={tab === "admin" ? "navTabActive" : "navTab"} onClick={() => setTab("admin")}>Admin</button>
          )}
        </div>
        <div className="topNavUser">
          <span>{username}</span>
          <button className="logoutBtn" onClick={logout}>Log out</button>
        </div>
      </nav>

      <div className="dashboardBody">
        {tab === "rooms" &&
          (!joined ? (
            <JoinScreen rooms={chat.rooms} onJoin={handleJoin} error={chat.joinError} />
          ) : (
            <ChatRoom chat={chat} />
          ))}
        {tab === "dms" && <DirectMessages />}
        {tab === "admin" && isAdmin && <AdminPanel />}
      </div>
    </div>
  );
}

function AppShell() {
  const { username } = useAuth();
  return <div className="app">{username ? <Dashboard /> : <AuthScreen />}</div>;
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;