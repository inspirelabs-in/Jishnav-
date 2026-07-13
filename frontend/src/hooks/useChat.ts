import { useState, useRef, useCallback, useEffect } from "react";
import { Message, Coupon, CrossSellData, ChatRecord } from "../types";

const API_BASE = "/api";

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function genSessionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Fallback UUID v4 generator
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

interface UseChatProps {
  guestToken: string | null;
  onLimitReached?: () => void;
}

export function useChat({ guestToken, onLimitReached }: UseChatProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<ChatRecord[]>([]);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const sessionId = useRef(genSessionId());
  const messagesRef = useRef<Message[]>([]);

  const syncMessages = (msgs: Message[]) => {
    messagesRef.current = msgs;
    setMessages(msgs);
  };

  const appendChunk = useCallback((id: string, chunk: string) => {
    setMessages(prev => {
      const next = prev.map(m => m.id === id ? { ...m, content: m.content + chunk } : m);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const setCoupons = useCallback((id: string, coupons: Coupon[]) => {
    setMessages(prev => {
      const next = prev.map(m => m.id === id ? { ...m, coupons } : m);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const setCrossSell = useCallback((id: string, data: CrossSellData) => {
    setMessages(prev => {
      const next = prev.map(m => m.id === id ? { ...m, crossSell: data } : m);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const setIsCouponSearch = useCallback((id: string, isCouponSearch: boolean) => {
    setMessages(prev => {
      const next = prev.map(m => m.id === id ? { ...m, isCouponSearch } : m);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const finalise = useCallback((id: string) => {
    setMessages(prev => {
      const next = prev.map(m => m.id === id ? { ...m, isStreaming: false } : m);
      messagesRef.current = next;
      return next;
    });
  }, []);

  // Fetch chat history from the backend
  const fetchHistory = useCallback(async () => {
    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }
      const resp = await fetch("/api/history", { headers });
      if (resp.ok) {
        const data = await resp.json();
        setHistory(data);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    }
  }, [guestToken]);

  // Load history on mount or when guestToken changes
  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isLoading) return;

    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    const userMsg: Message = { id: genId(), role: "user", content: text };
    const asstId = genId();
    const asstMsg: Message = { id: asstId, role: "assistant", content: "", isStreaming: true };

    const next = [...messagesRef.current, userMsg, asstMsg];
    syncMessages(next);
    setIsLoading(true);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }

      const resp = await fetch(`${API_BASE}/chat`, {
        method: "POST",
        headers,
        body: JSON.stringify({ session_id: sessionId.current, message: text }),
        signal: ctrl.signal,
      });

      if (resp.status === 403) {
        const errData = await resp.json();
        if (errData.detail === "GUEST_LIMIT_REACHED") {
          // Remove the empty assistant bubble that was appended
          syncMessages(messagesRef.current.filter(m => m.id !== asstId));
          setIsLoading(false);
          onLimitReached?.();
          return;
        }
      }

      if (!resp.ok || !resp.body) {
        appendChunk(asstId, "Sorry, something went wrong. Please try again.");
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.trim().split("\n");
          let event = "";
          let data = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            if (line.startsWith("data: ")) data = line.slice(6);
          }
          if (!data) continue;

          if (event === "text") {
            try { appendChunk(asstId, JSON.parse(data)); } catch { /* skip */ }
          } else if (event === "coupons") {
            try { setCoupons(asstId, JSON.parse(data)); } catch { /* skip */ }
          } else if (event === "cross_sell") {
            try { setCrossSell(asstId, JSON.parse(data)); } catch { /* skip */ }
          } else if (event === "meta") {
            try { setIsCouponSearch(asstId, !!JSON.parse(data).isCouponSearch); } catch { /* skip */ }
          } else if (event === "done") {
            finalise(asstId);
            fetchHistory(); // Refresh session history to show new session/title
          } else if (event === "error") {
            try { appendChunk(asstId, JSON.parse(data).message ?? "An error occurred."); } catch { /* skip */ }
            finalise(asstId);
          }
        }
      }
    } catch (err: unknown) {
      if ((err as Error)?.name !== "AbortError") {
        appendChunk(asstId, "Connection error. Please check your network and try again.");
        finalise(asstId);
      }
    } finally {
      setIsLoading(false);
      finalise(asstId);
    }
  }, [isLoading, guestToken, onLimitReached, appendChunk, setCoupons, setCrossSell, setIsCouponSearch, finalise, fetchHistory]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages(prev => {
      const next = prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    syncMessages([]);
    setActiveHistoryId(null);
    sessionId.current = genSessionId();
  }, []);

  const loadChat = useCallback((record: ChatRecord) => {
    abortRef.current?.abort();
    setIsLoading(false);
    syncMessages(record.messages);
    sessionId.current = record.sessionId;
    setActiveHistoryId(record.id);
  }, []);

  const deleteHistory = useCallback(async (id: string) => {
    try {
      const headers: Record<string, string> = {};
      if (guestToken) {
        headers["x-guest-token"] = guestToken;
      }
      const resp = await fetch(`/api/history/${id}`, {
        method: "DELETE",
        headers,
      });
      if (resp.ok) {
        setHistory(prev => prev.filter(r => r.id !== id));
        setActiveHistoryId(prev => {
          if (prev === id) {
            syncMessages([]);
            sessionId.current = genSessionId();
            return null;
          }
          return prev;
        });
      } else {
        console.error("Failed to delete chat history from server:", resp.statusText);
      }
    } catch (err) {
      console.error("Failed to delete chat history:", err);
    }
  }, [guestToken]);

  const renameHistory = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setHistory(prev => prev.map(r => r.id === id ? { ...r, title: trimmed } : r));
  }, []);

  return {
    messages,
    isLoading,
    history,
    activeHistoryId,
    sendMessage,
    stopStreaming,
    newChat,
    loadChat,
    deleteHistory,
    renameHistory,
  };
}
