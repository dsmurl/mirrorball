import { useState, useEffect } from "react";

export default function App() {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState<"gallery" | "upload">("gallery");
  const [images, setImages] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isLoadingImages, setIsLoadingImages] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";
  const COGNITO_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN ?? "";
  const CLIENT_ID = import.meta.env.VITE_USER_POOL_CLIENT_ID ?? "";
  const REDIRECT_URI = window.location.origin + "/";

  useEffect(() => {
    // Check for tokens in the URL hash (Implicit flow for simplicity in this demo)
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const idToken = params.get("id_token");

    if (idToken) {
      setToken(idToken);
      // Basic decode of JWT for UI display
      try {
        const payload = JSON.parse(atob(idToken.split(".")[1]));
        setUser(payload);
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
      } catch (e) {
        console.error("Failed to parse token", e);
      }
    }
  }, []);

  useEffect(() => {
    if (token && view === "gallery") {
      fetchImages();
    }
  }, [token, view]);

  useEffect(() => {
    if (toast) {
      // Set the timer slightly longer than the animation (1s)
      // to ensure the fade-out completes before the element is removed.
      const timer = setTimeout(() => setToast(null), 1200);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  async function fetchImages() {
    setIsLoadingImages(true);
    try {
      const res = await fetch(`${API_BASE}/images`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to fetch images");
      const data = await res.json();
      setImages(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsLoadingImages(false);
    }
  }

  function formatFileSize(bytes?: number) {
    if (!bytes) return "";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  const filteredImages = images.filter((img) =>
    img.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  function handleLogin() {
    const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=token&scope=email+openid+profile&redirect_uri=${encodeURIComponent(
      REDIRECT_URI,
    )}`;
    window.location.href = loginUrl;
  }

  function handleLogout() {
    setToken("");
    setUser(null);
    const logoutUrl = `${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(
      REDIRECT_URI,
    )}`;
    window.location.href = logoutUrl;
  }

  async function handleUpload(e: React.FormEvent) {
    e.preventDefault();
    if (!file || !token) {
      alert("Please login and select a file");
      return;
    }

    setIsUploading(true);
    setStatus("Reading file dimensions...");

    let dimensions = "";
    if (file.type.startsWith("image/")) {
      dimensions = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(`${img.width}x${img.height}`);
        img.onerror = () => resolve("");
        img.src = URL.createObjectURL(file);
      });
    }

    setStatus("Getting pre-signed URL...");

    try {
      // 1. Get pre-signed URL
      const presignRes = await fetch(`${API_BASE}/presign-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          contentType: file.type,
          fileName: file.name,
          title: title,
          dimensions: dimensions || undefined,
          fileSize: file.size,
        }),
      });

      if (!presignRes.ok) throw new Error(await presignRes.text());
      const { uploadUrl, imageId } = await presignRes.json();

      // 2. Upload to S3
      setStatus("Uploading to S3...");
      const s3Res = await fetch(uploadUrl, {
        method: "PUT",
        body: file,
        headers: {
          "Content-Type": file.type,
        },
      });

      if (!s3Res.ok) throw new Error("S3 upload failed");

      // 3. Confirm upload
      setStatus("Confirming with API...");
      const confirmRes = await fetch(`${API_BASE}/confirm-upload`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ imageId }),
      });

      if (!confirmRes.ok) throw new Error("Confirmation failed");

      setStatus("Upload successful!");
      setFile(null);
      setTitle("");
      // Switch to gallery to see the new image
      setTimeout(() => {
        setView("gallery");
        setStatus("");
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  }

  return (
    <div
      style={{ fontFamily: "system-ui, sans-serif", padding: 24, maxWidth: 800, margin: "0 auto" }}
    >
      <style>
        {`
          @keyframes fadeInOut {
            0% { opacity: 0; transform: translateY(-20px); }
            10% { opacity: 1; transform: translateY(0); }
            90% { opacity: 1; transform: translateY(0); }
            100% { opacity: 0; transform: translateY(-20px); }
          }
        `}
      </style>
      {toast && (
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
          {toast}
        </div>
      )}
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
          <svg
            width="44"
            height="44"
            viewBox="0 0 100 100"
            style={{ filter: "drop-shadow(0 2px 6px rgba(0,123,255,0.4))" }}
          >
            <defs>
              <radialGradient id="ballGrad" cx="35%" cy="35%" r="60%">
                <stop offset="0%" style={{ stopColor: "#ffffff", stopOpacity: 1 }} />
                <stop offset="40%" style={{ stopColor: "#007bff", stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: "#002a5a", stopOpacity: 1 }} />
              </radialGradient>
            </defs>
            <circle cx="50" cy="50" r="45" fill="url(#ballGrad)" stroke="#333" strokeWidth="2" />

            {/* Radial Mirror Tile Grid - Vertical Ellipses */}
            <ellipse
              cx="50"
              cy="50"
              rx="15"
              ry="45"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1"
            />
            <ellipse
              cx="50"
              cy="50"
              rx="30"
              ry="45"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />
            <line x1="50" y1="5" x2="50" y2="95" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

            {/* Radial Mirror Tile Grid - Horizontal Ellipses */}
            <ellipse
              cx="50"
              cy="50"
              rx="45"
              ry="15"
              fill="none"
              stroke="rgba(255,255,255,0.4)"
              strokeWidth="1"
            />
            <ellipse
              cx="50"
              cy="50"
              rx="45"
              ry="30"
              fill="none"
              stroke="rgba(255,255,255,0.3)"
              strokeWidth="1"
            />
            <line x1="5" y1="50" x2="95" y2="50" stroke="rgba(255,255,255,0.4)" strokeWidth="1" />

            {/* Bigger, More Sparkles */}
            {/* Top Left */}
            <g>
              <path
                d="M25 15 L25 35 M15 25 L35 25"
                stroke="white"
                strokeWidth="3"
                strokeLinecap="round"
              >
                <animate attributeName="opacity" values="0;1;0" dur="2s" repeatCount="indefinite" />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 25 25"
                  to="90 25 25"
                  dur="2s"
                  repeatCount="indefinite"
                />
              </path>
            </g>
            {/* Bottom Right */}
            <g>
              <path
                d="M75 65 L75 85 M65 75 L85 75"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
              >
                <animate
                  attributeName="opacity"
                  values="0;1;0"
                  dur="1.5s"
                  begin="0.7s"
                  repeatCount="indefinite"
                />
                <animateTransform
                  attributeName="transform"
                  type="rotate"
                  from="0 75 75"
                  to="-45 75 75"
                  dur="1.5s"
                  repeatCount="indefinite"
                />
              </path>
            </g>
            {/* Top Right */}
            <circle cx="80" cy="25" r="4" fill="white">
              <animate
                attributeName="opacity"
                values="0;1;0"
                dur="2.5s"
                begin="0.3s"
                repeatCount="indefinite"
              />
              <animate attributeName="r" values="2;5;2" dur="2.5s" repeatCount="indefinite" />
            </circle>
            {/* Center Area */}
            <circle cx="40" cy="40" r="3" fill="white">
              <animate
                attributeName="opacity"
                values="0;0.8;0"
                dur="3s"
                begin="1s"
                repeatCount="indefinite"
              />
            </circle>
          </svg>
          <h1 style={{ margin: 0, fontSize: "1.8em", color: "#333" }}>Mirror Ball</h1>
        </div>
        <div>
          {user ? (
            <div style={{ textAlign: "right" }}>
              <span style={{ marginRight: 12, fontSize: "0.9em" }}>
                Logged in as <strong>{user.email || user["cognito:username"]}</strong>
              </span>
              <button onClick={handleLogout}>Logout</button>
            </div>
          ) : (
            <button onClick={handleLogin} style={{ padding: "8px 16px" }}>
              Login
            </button>
          )}
        </div>
      </header>

      {user && (
        <nav style={{ marginBottom: 24, display: "flex", gap: 16 }}>
          <button
            onClick={() => setView("gallery")}
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
            onClick={() => setView("upload")}
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
        </nav>
      )}

      {user ? (
        <>
          {view === "gallery" ? (
            <section>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 16,
                }}
              >
                <h2 style={{ margin: 0 }}>Image Gallery</h2>
                <div style={{ position: "relative", width: "200px" }}>
                  <input
                    type="text"
                    placeholder="Search by title..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    style={{
                      padding: "8px 32px 8px 12px",
                      borderRadius: 4,
                      border: "1px solid #ccc",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      style={{
                        position: "absolute",
                        right: 8,
                        top: "50%",
                        transform: "translateY(-50%)",
                        background: "none",
                        border: "none",
                        color: "#999",
                        cursor: "pointer",
                        fontSize: "1.2em",
                        padding: "0 4px",
                        lineHeight: 1,
                      }}
                      title="Clear search"
                    >
                      &times;
                    </button>
                  )}
                </div>
              </div>
              {isLoadingImages ? (
                <p>Loading images...</p>
              ) : filteredImages.length === 0 ? (
                <p>
                  {searchTerm
                    ? "No images match your search."
                    : 'No images found. Go to "Upload New" to add some!'}
                </p>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
                    gap: 16,
                  }}
                >
                  {filteredImages.map((img) => {
                    const isPdf = img.originalFileName?.toLowerCase().endsWith(".pdf");
                    return (
                      <div
                        key={img.imageId}
                        style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}
                      >
                        {isPdf ? (
                          <div
                            style={{
                              width: "100%",
                              height: 150,
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              backgroundColor: "#f8f9fa",
                            }}
                          >
                            <svg
                              width="64"
                              height="64"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="#666"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                              <polyline points="14 2 14 8 20 8"></polyline>
                              <line x1="16" y1="13" x2="8" y2="13"></line>
                              <line x1="16" y1="17" x2="8" y2="17"></line>
                              <polyline points="10 9 9 9 8 9"></polyline>
                            </svg>
                          </div>
                        ) : (
                          <img
                            src={img.publicUrl}
                            alt={img.title}
                            style={{ width: "100%", height: 150, objectFit: "cover" }}
                          />
                        )}
                        <div style={{ padding: 12, fontSize: "0.8em" }}>
                          <div
                            style={{
                              fontWeight: "bold",
                              wordBreak: "break-word",
                              marginBottom: 4,
                            }}
                          >
                            {img.title}
                          </div>
                          <div style={{ color: "#666", fontSize: "0.9em", marginBottom: 4 }}>
                            {img.dimensions ? img.dimensions : "No dimensions"}{" "}
                            {img.fileSize ? ` • ${formatFileSize(img.fileSize)}` : ""}
                          </div>
                          <div style={{ color: "#666", marginBottom: 8, wordBreak: "break-word" }}>
                            {img.devName} • {new Date(img.uploadTime).toLocaleDateString()}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              gap: 4,
                              marginTop: 4,
                            }}
                          >
                            <div
                              style={{
                                color: "#007bff",
                                fontSize: "0.85em",
                                wordBreak: "break-all",
                              }}
                            >
                              {img.publicUrl}
                            </div>
                            <button
                              onClick={() => {
                                navigator.clipboard.writeText(img.publicUrl);
                                setToast("Link copied to clipboard!");
                              }}
                              style={{
                                alignSelf: "flex-start",
                                background: "none",
                                border: "none",
                                color: "#007bff",
                                cursor: "pointer",
                                fontSize: "0.85em",
                                padding: "4px 0",
                                textDecoration: "underline",
                                whiteSpace: "nowrap",
                              }}
                            >
                              copy link
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          ) : (
            <section style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
              <h2>Upload Image</h2>
              <form onSubmit={handleUpload}>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>
                    Title:
                  </label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Enter image title"
                    style={{ width: "100%", padding: 8, boxSizing: "border-box" }}
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    required
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </div>

                <button
                  type="submit"
                  disabled={isUploading || !file || !title}
                  style={{
                    padding: "10px 20px",
                    backgroundColor: isUploading || !file || !title ? "#ccc" : "#007bff",
                    color: "white",
                    border: "none",
                    borderRadius: 4,
                    cursor: isUploading || !file || !title ? "not-allowed" : "pointer",
                  }}
                >
                  {isUploading ? "Uploading..." : "Upload Image"}
                </button>
              </form>

              {status && (
                <p
                  style={{
                    marginTop: 12,
                    padding: 8,
                    background: status.startsWith("Error") ? "#fee" : "#efe",
                    borderRadius: 4,
                    border: status.startsWith("Error") ? "1px solid #fcc" : "1px solid #cfc",
                  }}
                >
                  {status}
                </p>
              )}
            </section>
          )}

          <hr style={{ margin: "24px 0" }} />

          {/*<details>*/}
          {/*  <summary style={{ cursor: "pointer", color: "#666" }}>Debug Env</summary>*/}
          {/*  <ul style={{ fontSize: "0.8em", color: "#666", marginTop: 12 }}>*/}
          {/*    <li>API: {import.meta.env.VITE_API_BASE_URL ?? "(unset)"}</li>*/}
          {/*    <li>*/}
          {/*      UserPool: {import.meta.env.VITE_USER_POOL_ID ?? "(unset)"} /{" "}*/}
          {/*      {import.meta.env.VITE_USER_POOL_CLIENT_ID ?? "(unset)"}*/}
          {/*    </li>*/}
          {/*    <li>Cognito Domain: {import.meta.env.VITE_COGNITO_DOMAIN ?? "(unset)"}</li>*/}
          {/*  </ul>*/}
          {/*</details>*/}
        </>
      ) : (
        <div style={{ textAlign: "center", marginTop: 100, color: "#666" }}>
          <p>Please login to access the image gallery and upload features.</p>
        </div>
      )}
    </div>
  );
}
