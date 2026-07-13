import { useState } from "react";
import { useChat } from "./hooks/useChat";
import { ChatWindow } from "./components/ChatWindow";
import { Sidebar } from "./components/Sidebar";
import { useAuth } from "./hooks/useAuth";
import { AuthModal } from "./components/AuthModal";

export default function App() {
  const {
    authState,
    user,
    guestToken,
    isAuthLoading,
    isLimitReached,
    setIsLimitReached,
    loginWithGoogle,
    startGuest,
    logout,
  } = useAuth();

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isDark, setIsDark] = useState(false); // light mode default
  const [showLoginModal, setShowLoginModal] = useState(false);

  const {
    messages, isLoading, history, activeHistoryId,
    sendMessage, stopStreaming, newChat, loadChat,
    deleteHistory, renameHistory,
  } = useChat({
    guestToken,
    onLimitReached: () => setIsLimitReached(true),
  });

  if (isAuthLoading) {
    return (
      <div className="flex h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="flex items-center gap-1.5">
          <span className="dp1 block w-2.5 h-2.5 rounded-full" style={{ background: "var(--brand)" }} />
          <span className="dp2 block w-2.5 h-2.5 rounded-full" style={{ background: "var(--brand)", opacity: 0.6 }} />
          <span className="dp3 block w-2.5 h-2.5 rounded-full" style={{ background: "var(--brand)", opacity: 0.3 }} />
        </div>
      </div>
    );
  }

  // Determine whether to show the Auth Modal
  const isAuthModalOpen = authState === "unauthenticated" || isLimitReached || showLoginModal;
  const modalVariant = isLimitReached ? "limit_reached" : "initial";

  return (
    <div
      className={`flex h-screen overflow-hidden relative ${isDark ? "dark" : ""}`}
      style={{ background: "var(--bg)" }}
    >
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
        authState={authState}
        user={user}
        onSignIn={() => setShowLoginModal(true)}
        onSignOut={logout}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <ChatWindow
          messages={messages}
          isLoading={isLoading}
          onSend={sendMessage}
          onStop={stopStreaming}
          isDark={isDark}
          isLimitReached={isLimitReached}
          onOpenAuth={() => setShowLoginModal(true)}
        />
      </div>

      <AuthModal
        isOpen={isAuthModalOpen}
        variant={modalVariant}
        onLogin={async () => {
          await loginWithGoogle();
          setShowLoginModal(false);
        }}
        onGuestAccess={async () => {
          await startGuest();
          setShowLoginModal(false);
        }}
        onClose={() => {
          setIsLimitReached(false);
          setShowLoginModal(false);
        }}
      />
    </div>
  );
}
