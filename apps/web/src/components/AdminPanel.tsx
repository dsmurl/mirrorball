import { useState, useEffect } from "react";

import { useUpdateAppConfig } from "../hooks/useUpdateAppConfig.ts";
import { useAuthContext } from "../contexts/AuthContext";

export const AdminPanel = () => {
  const { token, appConfig } = useAuthContext();
  const { mutate: saveConfig, isPending: isSaving } = useUpdateAppConfig(token);
  const [userRestriction, setUserRestriction] = useState("");

  // Sync local state when data is loaded
  useEffect(() => {
    if (appConfig) {
      setUserRestriction(appConfig.userRestriction || "");
    }
  }, [appConfig]);

  return (
    <section style={{ border: "1px solid #dc3545", padding: 16, borderRadius: 8 }}>
      <h2 style={{ color: "#dc3545", marginTop: 0 }}>Admin Control Panel</h2>
      <p>Manage global application restrictions.</p>

      <div style={{ marginTop: 24 }}>
        <label style={{ display: "block", fontWeight: "bold", marginBottom: 8 }}>
          User Email Restriction:
        </label>
        <input
          type="text"
          value={userRestriction}
          onChange={(e) => setUserRestriction(e.target.value)}
          placeholder="e.g. @gmail.com (leave blank for no restriction)"
          style={{
            width: "100%",
            padding: 10,
            boxSizing: "border-box",
            borderRadius: 4,
            border: "1px solid #ccc",
          }}
        />
        <p style={{ fontSize: "0.85em", color: "#666", marginTop: 8 }}>
          If set, all users must have this string in their email to login or access the API.
        </p>
      </div>

      <button
        onClick={() => saveConfig({ userRestriction })}
        disabled={isSaving}
        style={{
          marginTop: 16,
          padding: "10px 24px",
          backgroundColor: "#dc3545",
          color: "white",
          border: "none",
          borderRadius: 4,
          cursor: isSaving ? "not-allowed" : "pointer",
          fontWeight: "bold",
        }}
      >
        {isSaving ? "Saving..." : "Save Settings"}
      </button>
    </section>
  );
};
