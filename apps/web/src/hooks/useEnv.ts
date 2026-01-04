export const useEnv = () => {
  return {
    API_BASE: import.meta.env.VITE_API_BASE_URL ?? "",
    COGNITO_DOMAIN: import.meta.env.VITE_COGNITO_DOMAIN ?? "",
    CLIENT_ID: import.meta.env.VITE_USER_POOL_CLIENT_ID ?? "",
    REDIRECT_URI: window.location.origin + "/",
  };
};
