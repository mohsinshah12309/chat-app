import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../socket";
import { api } from "../lib/api";

function nowId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function useChatSocket() {
  const [rooms, setRooms] = useState([]);
  const [username, setUsername] = useState("");
  const [room, setRoom] = useState("");
  const [messages, setMessages] = useState([]);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [connected, setConnected] = useState(socket.connected);
  const [joinError, setJoinError] = useState("");
  const [kickedMessage, setKickedMessage] = useState("");
  const [rateLimitWarning, setRateLimitWarning] = useState("");

  const usernameRef = useRef("");
  const roomRef = useRef("");

  useEffect(() => {
    api
      .getRooms()
      .then((list) => setRooms(list))
      .catch(() => {});
  }, []);

  useEffect(() => {
    function onConnect() {
      setConnected(true);
      if (usernameRef.current && roomRef.current) {
        socket.emit("join_room", { room: roomRef.current }, (res) => {
          if (!res?.success) setJoinError(res?.message || "Could not rejoin.");
        });
      }
    }

    function onDisconnect() {
      setConnected(false);
    }

    // NOTE: `kind` distinguishes "message" vs "system" (join/leave notices),
    // separate from the server's `type` field which distinguishes "text" vs
    // "voice" content. These used to share the name `type`, which silently
    // clobbered the server's text/voice flag — kept separate now.
    function onReceiveMessage(msg) {
      setMessages((prev) => {
        if (msg.tempId) {
          const idx = prev.findIndex((m) => m.tempId === msg.tempId);
          if (idx !== -1) {
            const old = prev[idx];
            if (old.audioUrl?.startsWith("blob:")) {
              URL.revokeObjectURL(old.audioUrl);
            }
            const updated = [...prev];
            updated[idx] = {
              ...msg,
              kind: "message",
              own: msg.username === usernameRef.current,
              pending: false,
            };
            return updated;
          }
        }
        return [
          ...prev,
          { ...msg, kind: "message", own: msg.username === usernameRef.current },
        ];
      });
    }

    function onRoomHistory(history) {
      setMessages(
        (history || []).map((m) => ({
          ...m,
          kind: "message",
          own: m.username === usernameRef.current,
        }))
      );
    }

    function onRoomCleared({ room: clearedRoom }) {
      if (clearedRoom !== roomRef.current) return;
      setMessages([
        {
          id: nowId(),
          kind: "system",
          text: "Chat history was cleared by an admin",
          timestamp: new Date().toISOString(),
        },
      ]);
    }

    function onRoomUsers(users) {
      setOnlineUsers(users);
    }

    function onUserJoined({ message, timestamp }) {
      setMessages((prev) => [...prev, { id: nowId(), kind: "system", text: message, timestamp }]);
    }

    function onUserLeft({ message, timestamp }) {
      setMessages((prev) => [...prev, { id: nowId(), kind: "system", text: message, timestamp }]);
    }

    function onTyping({ username: who }) {
      setTypingUsers((prev) => (prev.includes(who) ? prev : [...prev, who]));
    }

    function onStopTyping({ username: who }) {
      setTypingUsers((prev) => prev.filter((u) => u !== who));
    }

    function onRoomsUpdated(updatedRooms) {
      setRooms(updatedRooms);
    }

    function onRoomDeleted({ room: deletedRoom }) {
      if (deletedRoom !== roomRef.current) return;
      roomRef.current = "";
      setRoom("");
      setMessages([]);
      setOnlineUsers([]);
      setTypingUsers([]);
      setKickedMessage(`The room "${deletedRoom}" was deleted by an admin.`);
    }

    function onReactionUpdate({ room: reactedRoom, messageId, reactions }) {
      if (reactedRoom !== roomRef.current) return;
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions } : m))
      );
    }

    function onRateLimited({ message }) {
      setRateLimitWarning(message);
      setTimeout(() => setRateLimitWarning(""), 3000);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("receive_message", onReceiveMessage);
    socket.on("room_history", onRoomHistory);
    socket.on("room_cleared", onRoomCleared);
    socket.on("room_users", onRoomUsers);
    socket.on("user_joined", onUserJoined);
    socket.on("user_left", onUserLeft);
    socket.on("typing", onTyping);
    socket.on("stop_typing", onStopTyping);
    socket.on("rooms_updated", onRoomsUpdated);
    socket.on("room_deleted", onRoomDeleted);
    socket.on("message:reaction_update", onReactionUpdate);
    socket.on("rate_limited", onRateLimited);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("receive_message", onReceiveMessage);
      socket.off("room_history", onRoomHistory);
      socket.off("room_cleared", onRoomCleared);
      socket.off("room_users", onRoomUsers);
      socket.off("user_joined", onUserJoined);
      socket.off("user_left", onUserLeft);
      socket.off("typing", onTyping);
      socket.off("stop_typing", onStopTyping);
      socket.off("rooms_updated", onRoomsUpdated);
      socket.off("room_deleted", onRoomDeleted);
      socket.off("message:reaction_update", onReactionUpdate);
      socket.off("rate_limited", onRateLimited);
    };
  }, []);

  const join = useCallback((name, roomName, callback) => {
    setJoinError("");
    setKickedMessage("");
    usernameRef.current = name;
    if (!socket.connected) socket.connect();

    const attemptJoin = () => {
      socket.emit("join_room", { room: roomName }, (res) => {
        if (res?.success) {
          roomRef.current = roomName;
          setUsername(name);
          setRoom(roomName);
        }
        callback?.(res);
      });
    };

    if (socket.connected) attemptJoin();
    else socket.once("connect", attemptJoin);
  }, []);

  const switchRoom = useCallback((newRoom) => {
    if (newRoom === roomRef.current) return;
    socket.emit("switch_room", { newRoom }, (res) => {
      if (res?.success) {
        roomRef.current = newRoom;
        setRoom(newRoom);
        setTypingUsers([]);
      }
    });
  }, []);

  const sendMessage = useCallback((text, replyTo) => {
    const trimmed = text?.trim();
    if (!trimmed) return;

    const tempId = `temp-${nowId()}`;

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        tempId,
        kind: "message",
        type: "text",
        username: usernameRef.current,
        text: trimmed,
        replyTo: replyTo || null,
        reactions: [],
        timestamp: new Date().toISOString(),
        own: true,
        pending: true,
      },
    ]);

    socket.emit("send_message", { text: trimmed, replyTo: replyTo || null, tempId });
  }, []);

  // Renders the recording immediately using a local blob URL (so it's
  // playable the instant recording stops), uploads to Cloudinary in the
  // background, then sends the real URL once upload completes. The
  // optimistic entry is reconciled by tempId in onReceiveMessage above.
  const sendVoiceMessage = useCallback(async (blob, replyTo) => {
    const tempId = `temp-${nowId()}`;
    const localUrl = URL.createObjectURL(blob);

    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        tempId,
        kind: "message",
        type: "voice",
        username: usernameRef.current,
        audioUrl: localUrl,
        duration: null,
        replyTo: replyTo || null,
        reactions: [],
        timestamp: new Date().toISOString(),
        own: true,
        pending: true,
      },
    ]);

    try {
      const { url, duration } = await api.uploadVoiceNote(blob);
      socket.emit("send_message", {
        type: "voice",
        audioUrl: url,
        duration,
        replyTo: replyTo || null,
        tempId,
      });
    } catch (err) {
      console.error("Voice note upload failed:", err.message);
      setMessages((prev) =>
        prev.map((m) => (m.tempId === tempId ? { ...m, pending: false, failed: true } : m))
      );
    }
  }, []);

  const reactToMessage = useCallback((messageId, emoji) => {
    socket.emit("message:react", { messageId, emoji });
  }, []);

  const emitTyping = useCallback(() => socket.emit("typing"), []);
  const emitStopTyping = useCallback(() => socket.emit("stop_typing"), []);

  return {
    rooms,
    username,
    room,
    messages,
    onlineUsers,
    typingUsers,
    connected,
    joinError,
    setJoinError,
    kickedMessage,
    setKickedMessage,
    rateLimitWarning,
    join,
    switchRoom,
    sendMessage,
    sendVoiceMessage,
    reactToMessage,
    emitTyping,
    emitStopTyping,
  };
}