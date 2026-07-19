import { createContext, useContext, useEffect, useState, useCallback } from "react";
import { api } from "../lib/api";
import { socket } from "../socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => localStorage.getItem("chat_token"));
  const [user, setUser] = useState(() => {
    const raw = localStorage.getItem("chat_user");
    return raw ? JSON.parse(raw) : null;
  });

  useEffect(() => {
    if (token) localStorage.setItem("chat_token", token);
    else localStorage.removeItem("chat_token");
  }, [token]);

  useEffect(() => {
    if (user) localStorage.setItem("chat_user", JSON.stringify(user));
    else localStorage.removeItem("chat_user");
  }, [user]);

  const login = useCallback(async (name, password) => {
    const data = await api.login(name, password);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name, password) => {
    const data = await api.register(name, password);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(() => {
    socket.disconnect();
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{ token, username: user?.username, isAdmin: !!user?.isAdmin, login, register, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}