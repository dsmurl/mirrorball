import { useAuthContext } from "../contexts/AuthContext";

export const RestrictionMessage = () => {
  const { user } = useAuthContext();
  // const searchParams = new URLSearchParams(window.location.search);
  // const isBackendRestricted = searchParams.get("error") === "restricted";
  //
  // if (!user && !isBackendRestricted) {
  //   return (
  //     <div
  //       style={{
  //         marginTop: 40,
  //         padding: 24,
  //         backgroundColor: "#f8f9fa",
  //         border: "1px solid #dee2e6",
  //         borderRadius: 8,
  //         textAlign: "center",
  //       }}
  //     >
  //       <h2>Welcome</h2>
  //       <p>Please log in to access the gallery and upload images.</p>
  //     </div>
  //   );
  // }

  return (
    <div
      style={{
        marginTop: 40,
        padding: 24,
        backgroundColor: "#fff3f3",
        border: "1px solid #dc3545",
        borderRadius: 8,
        textAlign: "center",
        color: "#721c24",
      }}
    >
      <h2 style={{ marginTop: 0 }}>Access Restricted</h2>
      <p>
        {user ? (
          <>
            You are logged in as <strong>{user.email ?? "[unknown email]"}</strong>, but your email
            address is not authorized to access this application.
          </>
        ) : (
          "Your email address is not authorized to access this application."
        )}
      </p>
      <p style={{ fontSize: "0.9em", color: "#666" }}>
        Please contact an administrator or log in with a different account.
      </p>
    </div>
  );
};
