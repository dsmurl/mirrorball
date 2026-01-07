import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEnv } from "./useEnv.ts";
import { useToastContext } from "../contexts/ToastContext.tsx";

export const useDeleteImage = (token: string) => {
  const { API_BASE } = useEnv();
  const queryClient = useQueryClient();
  const { showToast } = useToastContext();

  return useMutation({
    mutationFn: async (imageId: string) => {
      const res = await fetch(`${API_BASE}/images/${imageId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || "Failed to delete image");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["images"] });
      showToast("Image deleted successfully");
    },
    onError: (error: Error) => {
      showToast(`Error: ${error.message}`);
    },
  });
};
