import { Navigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { AppShell } from "./AppShell";

export function RequireAuth() {
  const status = useAuthStore((state) => state.status);

  if (status === "loading") {
    return (
      <div className="boot" role="status">
        <span className="spinner" aria-hidden="true" />
        <span className="visually-hidden">Loading</span>
      </div>
    );
  }
  if (status === "anonymous") return <Navigate to="/login" replace />;
  return <AppShell />;
}
