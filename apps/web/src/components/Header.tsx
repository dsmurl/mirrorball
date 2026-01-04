import { MirrorBall } from "./MirrorBall";

type HeaderProps = {
  user: any;
  onLogin: () => void;
  onLogout: () => void;
};

export const Header = ({ user, onLogin, onLogout }: HeaderProps) => {
  return (
    <header
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        borderBottom: "2px solid #eee",
        marginBottom: 12,
        paddingBottom: 12,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <MirrorBall />
        <h1 style={{ margin: 0, fontSize: "1.8em", color: "#333" }}>Mirror Ball</h1>
      </div>
      <div>
        {user ? (
          <div style={{ textAlign: "right" }}>
            <span style={{ marginRight: 12, fontSize: "0.9em" }}>
              Logged in as <strong>{user.email || user["cognito:username"]}</strong>
            </span>
            <button onClick={onLogout}>Logout</button>
          </div>
        ) : (
          <button onClick={onLogin} style={{ padding: "8px 16px" }}>
            Login
          </button>
        )}
      </div>
    </header>
  );
};
