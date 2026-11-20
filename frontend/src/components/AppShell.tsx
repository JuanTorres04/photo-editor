import { NavLink, Outlet } from "react-router-dom";
import { APP_NAME } from "../lib/config";
import { getErrorMessage } from "../lib/errors";
import { useAuthStore } from "../store/authStore";
import { useToastStore } from "../store/toastStore";

export function AppShell() {
  const user = useAuthStore((state) => state.user);
  const signOut = useAuthStore((state) => state.signOut);
  const push = useToastStore((state) => state.push);

  const handleSignOut = () => {
    signOut().catch((err: unknown) => push(getErrorMessage(err)));
  };

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <span className="brand">{APP_NAME}</span>
        <nav className="topnav" aria-label="Main">
          <NavLink to="/" end>
            Library
          </NavLink>
        </nav>
        <div className="topbar-user">
          <span className="user-email">{user?.email}</span>
          <button className="ghost" onClick={handleSignOut}>
            Sign out
          </button>
        </div>
      </header>
      <main id="main" className="main">
        <Outlet />
      </main>
    </div>
  );
}
