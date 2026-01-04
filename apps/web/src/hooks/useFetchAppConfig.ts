import { useQuery } from "@tanstack/react-query";
import { useEnv } from "./useEnv.ts";
import { AppConfig } from "@mirror-ball/shared-schemas/config";
import { HttpError } from "@mirror-ball/shared-schemas/HttpError";

export const useFetchAppConfig = (token?: string) => {
  const { API_BASE } = useEnv();

  return useQuery<AppConfig, HttpError>({
    queryKey: ["appConfig", token],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/config`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const message = await res.text();
        console.error(message, res.status, res.statusText);
        throw new HttpError({ message, status: res.status });
      }
      return res.json();
    },
    enabled: !!token,
    retry: false,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
  });
};
