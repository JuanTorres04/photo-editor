import { useEffect } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RequireAuth } from "./components/RequireAuth";
import { Toaster } from "./components/Toaster";
import { AuthPage } from "./pages/AuthPage";
import { LibraryPage } from "./pages/LibraryPage";
import { useAuthStore } from "./store/authStore";

export default function App() {
  const init = useAuthStore((state) => state.init);

  useEffect(() => init(), [init]);

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route element={<RequireAuth />}>
            <Route path="/" element={<LibraryPage />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        <Toaster />
      </BrowserRouter>
    </ErrorBoundary>
  );
}
