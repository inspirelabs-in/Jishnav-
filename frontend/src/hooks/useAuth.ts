import { useState, useEffect, useCallback } from "react";
import { AUTH_CONFIG } from "../config/auth";

export type AuthState = "authenticated" | "guest" | "unauthenticated";

export interface User {
  user_id: string;
  email: string;
  name: string;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>("unauthenticated");
  const [user, setUser] = useState<User | null>(null);
  const [guestToken, setGuestToken] = useState<string | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  const [isLimitReached, setIsLimitReached] = useState(false);

  // Helper to check current session on mount or after login
  const checkSession = useCallback(async () => {
    try {
      const resp = await fetch(AUTH_CONFIG.sessionEndpoint);
      if (resp.ok) {
        const userData = await resp.json();
        const userId = userData.user_id || userData[import.meta.env.VITE_USER_ID_FIELD || "user_id"];
        if (userId) {
          setUser({
            user_id: userId,
            email: userData.email || "",
            name: userData.name || "Authenticated User",
          });
          setAuthState("authenticated");
          setGuestToken(null);
          localStorage.removeItem("grabgpt_guest_token");
          setIsAuthLoading(false);
          return userId;
        }
      }
    } catch (err) {
      console.error("Session check error:", err);
    }

    // Fallback to guest token if session invalid/not found
    const storedGuestToken = localStorage.getItem("grabgpt_guest_token");
    if (storedGuestToken) {
      setGuestToken(storedGuestToken);
      setAuthState("guest");
      setUser(null);
    } else {
      setGuestToken(null);
      setAuthState("unauthenticated");
      setUser(null);
    }
    setIsAuthLoading(false);
    return null;
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  // Migrate guest sessions to authenticated user
  const migrateGuest = useCallback(async (token: string, userId: string) => {
    try {
      await fetch("/api/auth/migrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ guest_token: token, user_id: userId }),
      });
    } catch (err) {
      console.error("Migration failed:", err);
    } finally {
      localStorage.removeItem("grabgpt_guest_token");
      setGuestToken(null);
    }
  }, []);

  // Exchange auth code with backend
  const exchangeCode = useCallback(async (code: string) => {
    setIsAuthLoading(true);
    try {
      const resp = await fetch(AUTH_CONFIG.googleEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });

      if (!resp.ok) {
        throw new Error("Authentication request failed");
      }

      const data = await resp.json();
      const returnedUser = data.user;
      const userId = returnedUser.user_id || returnedUser[import.meta.env.VITE_USER_ID_FIELD || "user_id"];
      
      // Store returned cookie manually just in case, though backend sets it
      if (data.session_id) {
        document.cookie = `${AUTH_CONFIG.sessionCookieName}=${data.session_id}; path=/; max-age=86400;`;
      }

      setUser({
        user_id: userId,
        email: returnedUser.email || "",
        name: returnedUser.name || "Authenticated User",
      });
      setAuthState("authenticated");

      // Migrate guest chats if user was a guest before logging in
      const currentGuestToken = guestToken || localStorage.getItem("grabgpt_guest_token");
      if (currentGuestToken) {
        await migrateGuest(currentGuestToken, userId);
      }
      setIsLimitReached(false);
    } catch (err) {
      console.error("OAuth code exchange failed:", err);
      alert("Authentication failed. Please try again.");
    } finally {
      setIsAuthLoading(false);
    }
  }, [guestToken, migrateGuest]);

  // Initiate Google OAuth login
  const loginWithGoogle = useCallback(() => {
    return new Promise<void>((resolve, reject) => {
      // 1. Mock Auth Flow (always active if configured or if client_id is placeholder)
      if (AUTH_CONFIG.mockAuthEnabled || AUTH_CONFIG.googleClientId === "placeholder-google-client-id") {
        console.log("Mock Auth active. Initiating mock login...");
        exchangeCode("mock-auth-code-999")
          .then(() => resolve())
          .catch(reject);
        return;
      }

      // 2. Real Google Sign-in code flow
      const googleObj = (window as any).google;
      if (!googleObj || !googleObj.accounts || !googleObj.accounts.oauth2) {
        console.warn("Google GIS SDK not loaded. Falling back to mock login.");
        exchangeCode("mock-auth-code-999")
          .then(() => resolve())
          .catch(reject);
        return;
      }

      try {
        const client = googleObj.accounts.oauth2.initCodeClient({
          client_id: AUTH_CONFIG.googleClientId,
          scope: "openid email profile",
          ux_mode: "popup",
          callback: (response: any) => {
            if (response.code) {
              exchangeCode(response.code)
                .then(() => resolve())
                .catch(reject);
            } else {
              reject(new Error("No auth code returned from Google"));
            }
          },
          error_callback: (err: any) => {
            reject(err);
          }
        });
        client.requestCode();
      } catch (err) {
        console.error("Error initializing Google code client:", err);
        reject(err);
      }
    });
  }, [exchangeCode]);

  // Start Guest Mode
  const startGuest = useCallback(async () => {
    setIsAuthLoading(true);
    try {
      const resp = await fetch("/api/auth/guest", { method: "POST" });
      if (!resp.ok) {
        throw new Error("Guest token creation failed");
      }
      const data = await resp.json();
      localStorage.setItem("grabgpt_guest_token", data.guest_token);
      setGuestToken(data.guest_token);
      setAuthState("guest");
      setUser(null);
      setIsLimitReached(false);
    } catch (err) {
      console.error("Failed to start guest session:", err);
      alert("Failed to start guest session. Please try again.");
    } finally {
      setIsAuthLoading(false);
    }
  }, []);

  // Sign out
  const logout = useCallback(async () => {
    setIsAuthLoading(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch (err) {
      console.error("Logout request failed:", err);
    } finally {
      // Clear all state and cookies
      localStorage.removeItem("grabgpt_guest_token");
      document.cookie = `${AUTH_CONFIG.sessionCookieName}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;`;
      setAuthState("unauthenticated");
      setUser(null);
      setGuestToken(null);
      setIsLimitReached(false);
      setIsAuthLoading(false);
    }
  }, []);

  return {
    authState,
    user,
    guestToken,
    isAuthLoading,
    isLimitReached,
    setIsLimitReached,
    loginWithGoogle,
    startGuest,
    logout,
  };
}
