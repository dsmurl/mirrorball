import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

import { useAuthContext } from "../contexts/AuthContext";
import { useEnv } from "../hooks/useEnv";

type UploaderProps = {
  onSuccess: () => void;
};

export const Uploader = ({ onSuccess }: UploaderProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState("");
  const [isUploading, setIsUploading] = useState(false);

  const { token } = useAuthContext();
  const { API_BASE } = useEnv();
  const queryClient = useQueryClient();

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file || !title || !token) return;

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

      // Invalidate images query to refresh the gallery
      await queryClient.invalidateQueries({ queryKey: ["images"] });

      // Notify parent to switch view
      setTimeout(() => {
        onSuccess();
        setStatus("");
      }, 1500);
    } catch (err: any) {
      console.error(err);
      setStatus(`Error: ${err.message}`);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <section style={{ border: "1px solid #ccc", padding: 16, borderRadius: 8 }}>
      <h2>Upload Image</h2>
      <form onSubmit={handleUpload}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", fontWeight: "bold", marginBottom: 4 }}>Title:</label>
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
  );
};
