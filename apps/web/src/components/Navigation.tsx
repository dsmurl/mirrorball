import { useAuthContext } from "../contexts/AuthContext";

type NavigationProps = {
  view: "gallery" | "upload" | "admin";
  onViewChange: (view: "gallery" | "upload" | "admin") => void;
};

export const Navigation = ({ view, onViewChange }: NavigationProps) => {
  const { isAdmin } = useAuthContext();

  return (
    <nav style={{ marginBottom: 24, display: "flex", gap: 16 }}>
      <button
        onClick={() => onViewChange("gallery")}
        style={{
          background: "none",
          border: "none",
          borderBottom: view === "gallery" ? "2px solid #007bff" : "2px solid transparent",
          color: view === "gallery" ? "#007bff" : "#666",
          padding: "8px 0",
          cursor: "pointer",
          fontWeight: view === "gallery" ? "bold" : "normal",
        }}
      >
        Images
      </button>
      <button
        onClick={() => onViewChange("upload")}
        style={{
          background: "none",
          border: "none",
          borderBottom: view === "upload" ? "2px solid #007bff" : "2px solid transparent",
          color: view === "upload" ? "#007bff" : "#666",
          padding: "8px 0",
          cursor: "pointer",
          fontWeight: view === "upload" ? "bold" : "normal",
        }}
      >
        Upload New
      </button>
      <button
        onClick={() => isAdmin && onViewChange("admin")}
        disabled={!isAdmin}
        style={{
          background: "none",
          border: "none",
          borderBottom: view === "admin" ? "2px solid #007bff" : "2px solid transparent",
          color: isAdmin ? (view === "admin" ? "#007bff" : "#666") : "#ccc",
          padding: "8px 0",
          cursor: isAdmin ? "pointer" : "not-allowed",
          fontWeight: view === "admin" ? "bold" : "normal",
        }}
        title={isAdmin ? "" : "Admin access required"}
      >
        Admin
      </button>
    </nav>
  );
};
