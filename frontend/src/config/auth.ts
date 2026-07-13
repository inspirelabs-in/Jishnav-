export const AUTH_CONFIG = {
  googleClientId: (import.meta.env.VITE_GOOGLE_CLIENT_ID as string) || "placeholder-google-client-id",
  mockAuthEnabled: import.meta.env.VITE_MOCK_AUTH_ENABLED !== "false", // default to true for dev
  sessionCookieName: (import.meta.env.VITE_SESSION_COOKIE_NAME as string) || "grabon_session",
  sessionEndpoint: (import.meta.env.VITE_AUTH_SESSION_ENDPOINT as string) || "/api/mock/auth-session",
  googleEndpoint: (import.meta.env.VITE_AUTH_GOOGLE_ENDPOINT as string) || "/api/mock/auth-google",
};
