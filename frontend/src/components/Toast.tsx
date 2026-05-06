interface ToastProps {
  message: string;
  visible: boolean;
}

export default function Toast({ message, visible }: Readonly<ToastProps>) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: "2rem",
        right: "2rem",
        zIndex: 300,
        background: "var(--navy)",
        color: "#fff",
        padding: ".8rem 1.4rem",
        borderRadius: "10px",
        fontSize: ".85rem",
        fontWeight: 500,
        boxShadow: "0 4px 20px rgba(0,0,0,.25)",
        maxWidth: "320px",
        transform: visible ? "translateY(0)" : "translateY(80px)",
        opacity: visible ? 1 : 0,
        transition: "transform 0.3s, opacity 0.3s",
        pointerEvents: "none",
      }}
    >
      {message}
    </div>
  );
}
