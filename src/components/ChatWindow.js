'use client';

/**
 * CipherChat — Chat Window
 * Displays decrypted messages with bubbles, timestamps, and E2EE badges
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useChat } from '@/context/ChatContext';

export default function ChatWindow() {
  const {
    user,
    activeConversation,
    messages,
    selectConversation,
    onlineUsers,
    typingUsers,
    decryptMessageContent,
  } = useChat();

  const [decryptedMessages, setDecryptedMessages] = useState([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const messagesEndRef = useRef(null);
  const chatContainerRef = useRef(null);

  const isOnline = activeConversation
    ? onlineUsers.has(activeConversation.other_user_id)
    : false;

  const typingInfo = activeConversation
    ? typingUsers[activeConversation.id]
    : null;

  // Decrypt messages when they change
  useEffect(() => {
    if (!activeConversation || messages.length === 0) {
      setDecryptedMessages([]);
      return;
    }

    let cancelled = false;

    async function decrypt() {
      setIsDecrypting(true);
      const decrypted = [];

      for (const msg of messages) {
        if (cancelled) break;
        try {
          const text = await decryptMessageContent(
            msg.encrypted_content,
            msg.iv,
            activeConversation.id,
            activeConversation.other_public_key
          );
          decrypted.push({ ...msg, decryptedText: text });
        } catch {
          decrypted.push({ ...msg, decryptedText: '🔒 Unable to decrypt' });
        }
      }

      if (!cancelled) {
        setDecryptedMessages(decrypted);
        setIsDecrypting(false);
      }
    }

    decrypt();

    return () => { cancelled = true; };
  }, [messages, activeConversation, decryptMessageContent]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [decryptedMessages, typingInfo]);

  const formatMessageTime = useCallback((timestamp) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  }, []);

  const formatDateDivider = useCallback((timestamp) => {
    const date = new Date(timestamp * 1000);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) return 'Today';
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }, []);

  const getTimeRemaining = useCallback((expiresAt) => {
    if (!expiresAt) return null;
    const now = Math.floor(Date.now() / 1000);
    const remaining = expiresAt - now;
    if (remaining <= 0) return 'Expired';
    if (remaining < 60) return `${remaining}s`;
    if (remaining < 3600) return `${Math.floor(remaining / 60)}m`;
    if (remaining < 86400) return `${Math.floor(remaining / 3600)}h`;
    return `${Math.floor(remaining / 86400)}d`;
  }, []);

  // Group messages by date
  const groupedMessages = [];
  let lastDate = '';
  for (const msg of decryptedMessages) {
    const dateStr = new Date(msg.timestamp * 1000).toDateString();
    if (dateStr !== lastDate) {
      groupedMessages.push({ type: 'divider', date: msg.timestamp });
      lastDate = dateStr;
    }
    groupedMessages.push({ type: 'message', data: msg });
  }

  // Empty state
  if (!activeConversation) {
    return (
      <div className="chat-main">
        <div className="chat-empty">
          <div className="chat-empty-icon">🔐</div>
          <h2 className="chat-empty-title">Welcome to CipherChat</h2>
          <p className="chat-empty-text">
            Select a conversation or start a new one. All your messages are
            end-to-end encrypted — not even our servers can read them.
          </p>
          <div className="chat-empty-features">
            <div className="chat-empty-feature">
              <span className="feature-icon">🔒</span>
              <span className="feature-label">E2E Encrypted</span>
            </div>
            <div className="chat-empty-feature">
              <span className="feature-icon">👻</span>
              <span className="feature-label">Disappearing</span>
            </div>
            <div className="chat-empty-feature">
              <span className="feature-icon">🛡️</span>
              <span className="feature-label">Zero Knowledge</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="chat-main">
      {/* Header */}
      <div className="chat-header">
        <div className="chat-header-info">
          <button
            className="icon-btn chat-header-back"
            onClick={() => selectConversation(null)}
            type="button"
          >
            ←
          </button>
          <div className="conversation-avatar" style={{ width: 36, height: 36, minWidth: 36, fontSize: 13 }}>
            {activeConversation.other_username?.slice(0, 2).toUpperCase()}
            <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
          </div>
          <div>
            <div className="chat-header-name">{activeConversation.other_username}</div>
            <div className={`chat-header-status ${isOnline ? 'online' : ''}`}>
              {typingInfo ? 'typing...' : isOnline ? 'online' : 'offline'}
            </div>
          </div>
        </div>
        <div className="chat-header-actions">
          <span className="e2ee-badge">🔒 E2EE</span>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages" ref={chatContainerRef}>
        {isDecrypting && decryptedMessages.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <span className="spinner" style={{ color: 'var(--accent-cyan)' }} />
          </div>
        ) : (
          <>
            {/* Encryption notice */}
            <div className="encryption-status" style={{ marginBottom: 'var(--space-lg)' }}>
              <span className="encryption-status-icon">🔒</span>
              Messages are end-to-end encrypted. No one outside this chat can read them.
            </div>

            {groupedMessages.map((item, index) => {
              if (item.type === 'divider') {
                return (
                  <div key={`divider-${index}`} className="messages-date-divider">
                    <span>{formatDateDivider(item.date)}</span>
                  </div>
                );
              }

              const msg = item.data;
              const isSent = msg.sender_id === user?.id;
              const timeRemaining = getTimeRemaining(msg.expires_at);

              return (
                <div key={msg.id} className={`message-row ${isSent ? 'sent' : 'received'}`}>
                  <div className="message-bubble">
                    <div className="message-text">{msg.decryptedText}</div>
                    <div className="message-footer">
                      {msg.expires_at && (
                        <span className="message-disappearing">
                          ⏱️ {timeRemaining}
                        </span>
                      )}
                      <span className="message-time">{formatMessageTime(msg.timestamp)}</span>
                      <span className="message-lock">🔒</span>
                      {isSent && (
                        <span className={`message-status ${msg.is_read ? 'read' : ''}`}>
                          {msg.is_read ? '✓✓' : '✓'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {/* Typing indicator */}
            {typingInfo && (
              <div className="typing-indicator">
                <div className="typing-dots">
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                  <div className="typing-dot" />
                </div>
                {typingInfo.username} is typing...
              </div>
            )}

            <div ref={messagesEndRef} />
          </>
        )}
      </div>
    </div>
  );
}
