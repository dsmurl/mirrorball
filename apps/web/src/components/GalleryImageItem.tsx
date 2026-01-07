import { ImageItem } from "@mirror-ball/shared-schemas/image.ts";
import { useAuthContext } from "../contexts/AuthContext.tsx";
import { useDeleteImage } from "../hooks/useDeleteImage.ts";

type GalleryImageItemProps = {
  img: ImageItem;
  onCopyLink: (url: string) => void;
};

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const GalleryImageItem = ({ img, onCopyLink }: GalleryImageItemProps) => {
  const { isAdmin, token } = useAuthContext();
  const deleteMutation = useDeleteImage(token);

  const isPdf = img.originalFileName?.toLowerCase().endsWith(".pdf");

  const imagePublicUrl = img.publicUrl.startsWith("/")
    ? `${window.location.origin}${img.publicUrl}`
    : img.publicUrl;

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete "${img.title}"?`)) {
      deleteMutation.mutate(img.imageId);
    }
  };

  return (
    <div style={{ border: "1px solid #eee", borderRadius: 8, overflow: "hidden" }}>
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
          src={imagePublicUrl}
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
          {img.owner} • {new Date(img.uploadTime).toLocaleDateString()}
        </div>
        <div
          style={{
            color: "#007bff",
            fontSize: "0.85em",
            wordBreak: "break-all",
            marginBottom: 4,
          }}
        >
          {imagePublicUrl}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 4 }}>
          <button
            onClick={() => onCopyLink(imagePublicUrl)}
            style={{
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
          {isAdmin && (
            <button
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              style={{
                background: "none",
                border: "none",
                color: "#dc3545",
                cursor: "pointer",
                fontSize: "0.85em",
                padding: "4px 0",
                textDecoration: "underline",
                whiteSpace: "nowrap",
              }}
            >
              {deleteMutation.isPending ? "deleting..." : "delete"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
