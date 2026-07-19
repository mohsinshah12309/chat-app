import { useState } from "react";
import RoomSidebar from "./RoomSidebar";
import MessageList from "./MessageList";
import MessageInput from "./MessageInput";
import OnlineUsers from "./OnlineUsers";
import styles from "./ChatRoom.module.css";

function ChatRoom({ chat }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [usersOpen, setUsersOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);

  return (
    <div className={styles.layout}>
      {!chat.connected && (
        <div className={styles.reconnectBanner}>
          <span className={styles.reconnectDot} />
          Reconnecting…
        </div>
      )}

      {chat.rateLimitWarning && (
        <div className={styles.rateLimitBanner}>{chat.rateLimitWarning}</div>
      )}

      <header className={styles.topbar}>
        <button className={styles.iconBtn} onClick={() => setSidebarOpen((v) => !v)} aria-label="Toggle channels">☰</button>
        <div className={styles.topbarTitle}>
          <span className={styles.pulseDot} />
          {chat.room}
        </div>
        <button className={styles.iconBtn} onClick={() => setUsersOpen((v) => !v)} aria-label="Toggle online users">
          {chat.onlineUsers.length}
        </button>
      </header>

      <div className={styles.body}>
        <RoomSidebar
          rooms={chat.rooms}
          activeRoom={chat.room}
          onSwitch={(r) => { chat.switchRoom(r); setSidebarOpen(false); }}
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        <main className={styles.main}>
          <MessageList
            key={chat.room}
            messages={chat.messages}
            typingUsers={chat.typingUsers}
            currentUsername={chat.username}
            onReact={chat.reactToMessage}
            onReply={setReplyingTo}
          />
          <MessageInput
            onSend={chat.sendMessage}
            onSendVoice={chat.sendVoiceMessage}
            onTyping={chat.emitTyping}
            onStopTyping={chat.emitStopTyping}
            replyingTo={replyingTo}
            onCancelReply={() => setReplyingTo(null)}
          />
        </main>

        <OnlineUsers
          users={chat.onlineUsers}
          currentUser={chat.username}
          open={usersOpen}
          onClose={() => setUsersOpen(false)}
        />
      </div>
    </div>
  );
}

export default ChatRoom;