import { useAuthContext } from "../contexts/AuthContext";
import { useEnv } from "./useEnv";

export const useLogin = () => {
  const { logout: authLogout } = useAuthContext();
  const { COGNITO_DOMAIN, CLIENT_ID, REDIRECT_URI } = useEnv();

  const login = () => {
    const loginUrl = `${COGNITO_DOMAIN}/login?client_id=${CLIENT_ID}&response_type=token&scope=email+openid+profile&redirect_uri=${encodeURIComponent(
      REDIRECT_URI,
    )}`;
    window.location.href = loginUrl;
  };

  const logout = () => {
    const logoutUrl = `${COGNITO_DOMAIN}/logout?client_id=${CLIENT_ID}&logout_uri=${encodeURIComponent(
      REDIRECT_URI,
    )}`;
    authLogout(logoutUrl);
  };

  return { login, logout };
};
