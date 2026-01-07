import { useImages } from "../hooks/useImages";
import { useAuthContext } from "../contexts/AuthContext.tsx";
import { useEnv } from "../hooks/useEnv";
import { useToastContext } from "../contexts/ToastContext.tsx";
import { GalleryImageItem } from "./GalleryImageItem";

type GalleryProps = {
  searchTerm: string;
  onSearchChange: (term: string) => void;
};

export const Gallery = ({ searchTerm, onSearchChange }: GalleryProps) => {
  const { token } = useAuthContext();
  const { API_BASE } = useEnv();
  const { showToast } = useToastContext();
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
          {filteredImages.map((img) => (
            <GalleryImageItem key={img.imageId} img={img} onCopyLink={handleCopyLink} />
          ))}
        </div>
      )}
    </section>
  );
};
