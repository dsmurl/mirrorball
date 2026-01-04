import { useImages } from "../hooks/useImages";
import { useAuthContext } from "../contexts/AuthContext.tsx";
import { useEnv } from "../hooks/useEnv";
import { useToast } from "../hooks/useToast.ts";

type GalleryProps = {
  searchTerm: string;
  onSearchChange: (term: string) => void;
};

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const Gallery = ({ searchTerm, onSearchChange }: GalleryProps) => {
  const { token } = useAuthContext();
  const { API_BASE } = useEnv();
  const { showToast } = useToast();
  const { images, isLoading, error } = useImages({ token, apiBase: API_BASE });

  const handleCopyLink = (url: string) => {
    navigator.clipboard.writeText(url);
    showToast("Link copied to clipboard!");
  };

  if (error) {
    return (
      <div
        style={{
          padding: 20,
          backgroundColor: "#fff3f3",
          border: "1px solid #f5c6cb",
          borderRadius: 4,
          color: "#721c24",
        }}
      >
        <h3>Access Denied</h3>
        <p>{error.message || "You do not have permission to view the gallery."}</p>
      </div>
    );
  }

  const filteredImages = images.filter((img) =>
    img.title.toLowerCase().includes(searchTerm.toLowerCase()),
  );

  return (
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
            onChange={(e) => onSearchChange(e.target.value)}
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
              onClick={() => onSearchChange("")}
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

      {isLoading ? (
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
                  <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 4 }}>
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
                      onClick={() => handleCopyLink(img.publicUrl)}
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
  );
};
