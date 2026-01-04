type ToastProps = {
  message: string | null;
};

export const Toast = ({ message }: ToastProps) => {
  if (!message) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 20,
        right: 20,
        backgroundColor: "#28a745",
        color: "white",
        padding: "12px 24px",
        borderRadius: 4,
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        zIndex: 1000,
        animation: "fadeInOut 1s ease-in-out forwards",
      }}
    >
      {message}
    </div>
  );
};
