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
        <div className="brand">
          <span className="logo" aria-hidden="true" />
          {APP_NAME}
        </div>
        <nav className="modules" aria-label="Modules">
          <NavLink to="/" end>
            Library
          </NavLink>
          <span
            className="module disabled"
            aria-disabled="true"
            title="Open a photo to start editing"
          >
            Develop
          </span>
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
