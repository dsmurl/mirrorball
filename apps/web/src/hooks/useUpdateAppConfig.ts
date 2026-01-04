import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "./useToast";
import { useEnv } from "./useEnv.ts";
import { HttpError } from "@mirror-ball/shared-schemas/HttpError";

export const useUpdateAppConfig = (token?: string) => {
  const { API_BASE } = useEnv();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const mutation = useMutation({
    mutationFn: async (newConfig: { userRestriction: string }) => {
      const res = await fetch(`${API_BASE}/config`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(newConfig),
      });
      if (!res.ok) throw new HttpError({ message: await res.text(), status: res.status });

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["appConfig"] });
      showToast("Settings saved successfully!");
    },
    onError: (err: any) => {
      alert(`Failed to save: ${err.message}`);
    },
  });

  return mutation;
};
