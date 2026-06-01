"use client";
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui", padding: "3rem", textAlign: "center", background: "#FAFAF8", color: "#0A0A0A" }}>
        <h1 style={{ fontSize: 24, fontWeight: 700, marginBottom: 12 }}>Something went wrong</h1>
        <p style={{ color: "#6B6B6B", marginBottom: 20 }}>{error.message}</p>
        <button onClick={reset} className="btn-primary">Try again</button>
      </body>
    </html>
  );
}
