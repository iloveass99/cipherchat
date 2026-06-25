'use client';

/**
 * CipherChat — Main App Page
 * Handles auth gate and routing to chat
 */

import { ChatProvider, useChat } from '@/context/ChatContext';
import AuthForm from '@/components/AuthForm';
import ChatView from '@/components/ChatView';

function AppContent() {
  const { user, isLoading } = useChat();

  if (isLoading) {
    return (
      <>
        <div className="animated-bg" />
        <div className="grid-overlay" />
        <div className="loading-screen">
          <div className="loading-logo">🔒</div>
          <div className="loading-text">Initializing encryption...</div>
        </div>
      </>
    );
  }

  if (!user) {
    return <AuthForm />;
  }

  return <ChatView />;
}

export default function Home() {
  return (
    <ChatProvider>
      <AppContent />
    </ChatProvider>
  );
}
