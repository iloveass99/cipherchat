'use client';

/**
 * CipherChat — Chat View (Phase 2)
 * Main chat interface with sidebar, chat window, message input,
 * call screens, group creation, and profile editor
 */

import { useState } from 'react';
import { useChat } from '@/context/ChatContext';
import ChatSidebar from '@/components/ChatSidebar';
import ChatWindow from '@/components/ChatWindow';
import MessageInput from '@/components/MessageInput';
import UserSearch from '@/components/UserSearch';
import CreateGroup from '@/components/CreateGroup';
import CallScreen from '@/components/CallScreen';
import IncomingCall from '@/components/IncomingCall';
import ProfileEditor from '@/components/ProfileEditor';

export default function ChatView() {
  const [showUserSearch, setShowUserSearch] = useState(false);
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const { activeConversation, callState } = useChat();

  return (
    <>
      <div className="animated-bg" />
      <div className="grid-overlay" />

      <div className={`chat-layout ${activeConversation ? 'chat-open' : ''}`}>
        <ChatSidebar
          onOpenSearch={() => setShowUserSearch(true)}
          onOpenCreateGroup={() => setShowCreateGroup(true)}
          onOpenProfile={() => setShowProfile(true)}
        />

        <div className="chat-main">
          <ChatWindow />
          {activeConversation && <MessageInput />}
        </div>
      </div>

      {/* Modals */}
      <UserSearch
        isOpen={showUserSearch}
        onClose={() => setShowUserSearch(false)}
      />

      <CreateGroup
        isOpen={showCreateGroup}
        onClose={() => setShowCreateGroup(false)}
      />

      <ProfileEditor
        isOpen={showProfile}
        onClose={() => setShowProfile(false)}
      />

      {/* Call UI */}
      {callState === 'incoming' && <IncomingCall />}
      {(callState === 'active' || callState === 'ringing') && <CallScreen />}
    </>
  );
}

