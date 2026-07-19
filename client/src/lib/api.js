const SERVER_URL = import.meta.env.VITE_SERVER_URL || "http://localhost:5000";

function getToken() {
  return localStorage.getItem("chat_token");
}

async function request(path, { method = "GET", body } = {}) {
  const token = getToken();
  const res = await fetch(`${SERVER_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.message || "Request failed.");
  return data;
}

export const api = {
  getRooms: () => request("/api/rooms"),
  register: (username, password) =>
    request("/api/auth/register", { method: "POST", body: { username, password } }),
  login: (username, password) =>
    request("/api/auth/login", { method: "POST", body: { username, password } }),
  searchUsers: (q) => request(`/api/users/search?q=${encodeURIComponent(q)}`),
  getInbox: () => request("/api/dms"),
  getDmHistory: (username) => request(`/api/dms/${encodeURIComponent(username)}`),
  deleteConversation: (username) =>
    request(`/api/dms/${encodeURIComponent(username)}`, { method: "DELETE" }),
  // Voice notes go through a separate multipart upload, not the JSON
  // `request()` helper above — different content type, no JSON body.
  uploadVoiceNote: async (blob) => {
    const token = getToken();
    const formData = new FormData();
    formData.append("audio", blob, "voice-note.webm");

    const res = await fetch(`${SERVER_URL}/api/upload/voice`, {
      method: "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || "Voice upload failed.");
    return data; // { url, duration }
  },
  getAdminRooms: () => request("/api/admin/rooms"),
  clearRoomMessages: (room) =>
    request(`/api/admin/rooms/${encodeURIComponent(room)}/messages`, { method: "DELETE" }),
  createRoom: (name) =>
    request("/api/admin/rooms", { method: "POST", body: { name } }),
  deleteRoom: (room) =>
    request(`/api/admin/rooms/${encodeURIComponent(room)}`, { method: "DELETE" }),
  // E2E encryption: push this browser's public key to the server, and fetch
  // another user's public key before encrypting a message to them.
  setPublicKey: (publicKey) =>
    request("/api/auth/public-key", { method: "PATCH", body: { publicKey } }),
  getPublicKey: (username) =>
    request(`/api/auth/public-key/${encodeURIComponent(username)}`),
};