import { useState, useRef, useCallback, useEffect } from "react";
import { Message, Coupon, ChatRecord } from "../types";

const API_BASE = "/api";
const STORAGE_KEY = "grabgpt_history";

function genId(): string {
  return Math.random().toString(36).slice(2, 10);
}

function genSessionId(): string {
  return `sess_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadHistoryFromStorage(): ChatRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveHistoryToStorage(history: ChatRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(history));
  } catch { /* quota exceeded — silently ignore */ }
}

export function useChat() {
  const [messages, setMessages]     = useState<Message[]>([]);
  const [isLoading, setIsLoading]   = useState(false);
  const [history, setHistory]       = useState<ChatRecord[]>(loadHistoryFromStorage);
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null);
  const abortRef    = useRef<AbortController | null>(null);
  const sessionId   = useRef(genSessionId());
  const messagesRef = useRef<Message[]>([]);

  // Persist history to localStorage on every change
  useEffect(() => {
    saveHistoryToStorage(history);
  }, [history]);

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

  const finalise = useCallback((id: string) => {
    setMessages(prev => {
      const next = prev.map(m => m.id === id ? { ...m, isStreaming: false } : m);
      messagesRef.current = next;
      return next;
    });
  }, []);

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
      const resp = await fetch(`${API_BASE}/chat`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ session_id: sessionId.current, message: text }),
        signal:  ctrl.signal,
      });

      if (!resp.ok || !resp.body) {
        appendChunk(asstId, "Sorry, something went wrong. Please try again.");
        return;
      }

      const reader  = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer    = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n\n");
        buffer = parts.pop() ?? "";

        for (const part of parts) {
          const lines = part.trim().split("\n");
          let event = "";
          let data  = "";
          for (const line of lines) {
            if (line.startsWith("event: ")) event = line.slice(7);
            if (line.startsWith("data: "))  data  = line.slice(6);
          }
          if (!data) continue;

          if (event === "text") {
            try { appendChunk(asstId, JSON.parse(data)); } catch { /* skip */ }
          } else if (event === "coupons") {
            try { setCoupons(asstId, JSON.parse(data)); } catch { /* skip */ }
          } else if (event === "done") {
            finalise(asstId);
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
  }, [isLoading, appendChunk, setCoupons, finalise]);

  const stopStreaming = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    setMessages(prev => {
      const next = prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m);
      messagesRef.current = next;
      return next;
    });
  }, []);

  const saveCurrentToHistory = useCallback(() => {
    const current = messagesRef.current;
    const firstUser = current.find(m => m.role === "user");
    if (!firstUser) return;

    const sid = sessionId.current;
    setHistory(prev => {
      if (prev.some(r => r.sessionId === sid)) return prev;
      const record: ChatRecord = {
        id: genId(),
        title: firstUser.content.length > 55
          ? firstUser.content.slice(0, 55).trim() + "…"
          : firstUser.content,
        sessionId: sid,
        timestamp: Date.now(),
        messages: current.map(m => ({ ...m, isStreaming: false })),
      };
      return [record, ...prev];
    });
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    setIsLoading(false);
    saveCurrentToHistory();
    syncMessages([]);
    setActiveHistoryId(null);
    sessionId.current = genSessionId();
  }, [saveCurrentToHistory]);

  const loadChat = useCallback((record: ChatRecord) => {
    abortRef.current?.abort();
    setIsLoading(false);
    saveCurrentToHistory();
    syncMessages(record.messages);
    sessionId.current = record.sessionId;
    setActiveHistoryId(record.id);
  }, [saveCurrentToHistory]);

  const deleteHistory = useCallback((id: string) => {
    setHistory(prev => prev.filter(r => r.id !== id));
    setActiveHistoryId(prev => prev === id ? null : prev);
  }, []);

  const renameHistory = useCallback((id: string, newTitle: string) => {
    const trimmed = newTitle.trim();
    if (!trimmed) return;
    setHistory(prev => prev.map(r => r.id === id ? { ...r, title: trimmed } : r));
  }, []);

  return {
    messages, isLoading, history, activeHistoryId,
    sendMessage, stopStreaming, newChat, loadChat,
    deleteHistory, renameHistory,
  };
}
