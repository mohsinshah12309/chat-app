import { useState } from "react";
import { useAuth } from "../context/AuthContext";
import styles from "./AuthScreen.module.css";

function AuthScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (mode === "login") await login(username.trim(), password);
      else await register(username.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.tabs}>
          <button type="button" className={`${styles.tab} ${mode === "login" ? styles.tabActive : ""}`}
            onClick={() => { setMode("login"); setError(""); }}>Sign in</button>
          <button type="button" className={`${styles.tab} ${mode === "register" ? styles.tabActive : ""}`}
            onClick={() => { setMode("register"); setError(""); }}>Create account</button>
        </div>

        <h1 className={styles.title}>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
        <p className={styles.subtitle}>
          {mode === "login" ? "Sign in to join rooms and message people." : "Pick a unique username to get started."}
        </p>

        <form onSubmit={handleSubmit} className={styles.form}>
          <label className={styles.label} htmlFor="username">Username</label>
          <input id="username" className={styles.input} type="text" value={username}
            onChange={(e) => setUsername(e.target.value)} maxLength={20} autoComplete="username" />

          <label className={styles.label} htmlFor="password">Password</label>
          <input id="password" className={styles.input} type="password" value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={mode === "login" ? "current-password" : "new-password"} />

          {error && <div className={styles.error}>{error}</div>}

          <button type="submit" className={styles.submit} disabled={loading || !username.trim() || !password}>
            {loading ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default AuthScreen;