import { useState, useMemo } from "react";

import { useLogin } from "./hooks/useLogin";
import { useToast } from "./hooks/useToast";
import { Header } from "./components/Header";
import { Navigation } from "./components/Navigation";
import { Gallery } from "./components/Gallery";
import { Uploader } from "./components/Uploader";
import { AdminPanel } from "./components/AdminPanel";

import { Toast } from "./components/Toast";
import { useAuthContext } from "./contexts/AuthContext.tsx";
import { RestrictionMessage } from "./components/RestrictionMessage.tsx";
import { NotLoggedIn } from "./components/AccessDenied.tsx";

export default function App() {
  const { user, authState } = useAuthContext();
  const { login, logout } = useLogin();
  const { toast } = useToast();

  const [view, setView] = useState<"gallery" | "upload" | "admin">("gallery");
  const [searchTerm, setSearchTerm] = useState("");

  return (
    <div
      style={{
        fontFamily: "system-ui, sans-serif",
        padding: 24,
        maxWidth: 800,
        margin: "0 auto",
      }}
    >
      <Toast message={toast} />
      <Header user={user} onLogin={login} onLogout={logout} />

      {authState === "VALID_USER" ? (
        <>
          <Navigation view={view} onViewChange={setView} />

          {view === "gallery" ? (
            <Gallery searchTerm={searchTerm} onSearchChange={setSearchTerm} />
          ) : view === "upload" ? (
            <Uploader onSuccess={() => setView("gallery")} />
          ) : (
            <AdminPanel />
          )}

          <hr style={{ margin: "24px 0" }} />
        </>
      ) : null}

      {authState === "RESTRICTED_USER" ? <RestrictionMessage /> : null}
      {authState === "NOT_LOGGED_IN" ? <NotLoggedIn /> : null}
      {authState === "VALIDATING" ? <p>Validating...</p> : null}
    </div>
  );
}
