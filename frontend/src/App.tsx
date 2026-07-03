import { useState } from "react";
import { useChat } from "./hooks/useChat";
import { ChatWindow } from "./components/ChatWindow";
import { Sidebar } from "./components/Sidebar";

export default function App() {
  const {
    messages, isLoading, history, activeHistoryId,
    sendMessage, stopStreaming, newChat, loadChat,
    deleteHistory, renameHistory,
  } = useChat();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDark, setIsDark] = useState(false);

  return (
    <div className={`flex h-screen overflow-hidden relative ${isDark ? "" : "theme-light"}`} style={{ background: "var(--bg-app)" }}>
      <div className="grain-overlay" />
      <Sidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(o => !o)}
        onNewChat={newChat}
        onLoadChat={loadChat}
        onDeleteHistory={deleteHistory}
        onRenameHistory={renameHistory}
        history={history}
        activeHistoryId={activeHistoryId}
        isDark={isDark}
        onToggleDark={() => setIsDark(d => !d)}
      />

      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative z-[1]">
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          onStop={stopStreaming}
          isDark={isDark}
        />
      </div>
    </div>
  );
}
