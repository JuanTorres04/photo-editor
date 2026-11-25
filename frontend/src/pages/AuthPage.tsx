import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { Logo } from "../components/Logo";
import { WaterfallScene } from "../components/WaterfallScene";
import { APP_NAME } from "../lib/config";
import { getErrorMessage } from "../lib/errors";
import { useAuthStore } from "../store/authStore";

type Mode = "login" | "register";

export function AuthPage() {
  const status = useAuthStore((state) => state.status);
  const signIn = useAuthStore((state) => state.signIn);
  const signUp = useAuthStore((state) => state.signUp);
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  if (status === "authenticated") return <Navigate to="/" replace />;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    if (mode === "register" && password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    setLoading(true);
    try {
      if (mode === "login") {
        await signIn(email.trim(), password);
      } else {
        const result = await signUp(email.trim(), password);
        if (result === "confirm-email") {
          setNotice("Check your inbox to confirm your email, then sign in.");
        }
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const isLogin = mode === "login";

  return (
    <div className="auth-page">
      <WaterfallScene variant="full" className="auth-scene" />
      <div className="auth-shade" aria-hidden="true" />

      <main className="auth-layout">
        <div className="auth-intro">
          <p className="auth-tagline">Every photo at its best.</p>
          <p className="auth-note">
            Edit in your browser for free with the software pros use.
          </p>
        </div>

        <form className="auth-card" onSubmit={(e) => void handleSubmit(e)}>
          <div className="auth-brand">
            <div className="brand">
              <Logo size={28} />
              {APP_NAME}
            </div>
            <h1>{isLogin ? "Sign in" : "Create your account"}</h1>
            <p className="auth-sub">
              {isLogin
                ? "Welcome back. Pick up where you left off."
                : "It takes a few seconds and it's free."}
            </p>
          </div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "auth-error" : undefined}
            />
          </div>

          <div className="field">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={isLogin ? "current-password" : "new-password"}
              minLength={isLogin ? undefined : 8}
              required
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "auth-error" : undefined}
            />
          </div>

          {error && (
            <p id="auth-error" className="form-error" role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}

          <button className="primary" type="submit" disabled={loading}>
            {loading
              ? "Please wait..."
              : isLogin
                ? "Sign in"
                : "Create account"}
          </button>

          <button
            className="ghost switch"
            type="button"
            onClick={() => {
              setError(null);
              setNotice(null);
              setMode(isLogin ? "register" : "login");
            }}
          >
            {isLogin
              ? "New here? Create an account"
              : "Already have an account? Sign in"}
          </button>
        </form>
      </main>
    </div>
  );
}
