'use client';

/**
 * CipherChat — Chat View
 * Main chat interface with sidebar, chat window, and message input
 */

import { useState } from 'react';
import { useChat } from '@/context/ChatContext';
import ChatSidebar from '@/components/ChatSidebar';
import ChatWindow from '@/components/ChatWindow';
import MessageInput from '@/components/MessageInput';
import UserSearch from '@/components/UserSearch';

export default function ChatView() {
  const [showUserSearch, setShowUserSearch] = useState(false);
  const { activeConversation } = useChat();

  return (
    <>
      <div className="animated-bg" />
      <div className="grid-overlay" />

      <div className={`chat-layout ${activeConversation ? 'chat-open' : ''}`}>
        <ChatSidebar onOpenSearch={() => setShowUserSearch(true)} />

        <div className="chat-main">
          <ChatWindow />
          {activeConversation && <MessageInput />}
        </div>
      </div>

      <UserSearch
        isOpen={showUserSearch}
        onClose={() => setShowUserSearch(false)}
      />
    </>
  );
}
