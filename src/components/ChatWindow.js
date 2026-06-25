'use client';

/**
 * CipherChat — Chat Window (Phase 2)
 * Messages with E2EE, read receipts, call buttons, and group support
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
    initiateCall,
  } = useChat();

  const [decryptedMessages, setDecryptedMessages] = useState([]);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const messagesEndRef = useRef(null);

  const isGroup = activeConversation?.is_group === 1;

  const isOnline = activeConversation
    ? isGroup
      ? false
      : onlineUsers.has(activeConversation.other_user_id)
    : false;

  const typingInfo = activeConversation
    ? typingUsers[activeConversation.id]
    : null;

  // Get the correct public key for decryption
  const getPublicKeyForConversation = useCallback((msg) => {
    if (!activeConversation) return null;

    if (isGroup) {
      // For group chats, find the sender's public key from members
      const sender = activeConversation.members?.find(m => m.id === msg.sender_id);
      return sender?.public_key || null;
    }

    return activeConversation.other_public_key;
  }, [activeConversation, isGroup]);

  // Decrypt messages
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
          const pubKey = isGroup
            ? activeConversation.other_public_key || getPublicKeyForConversation(msg)
            : activeConversation.other_public_key;

          const text = await decryptMessageContent(
            msg.encrypted_content,
            msg.iv,
            activeConversation.id,
            pubKey
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
  }, [messages, activeConversation, decryptMessageContent, isGroup, getPublicKeyForConversation]);

  // Auto-scroll
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

  // Get sender name for group messages
  const getSenderName = useCallback((senderId) => {
    if (!isGroup || !activeConversation?.members) return null;
    if (senderId === user?.id) return null;
    const member = activeConversation.members.find(m => m.id === senderId);
    return member?.username || 'Unknown';
  }, [isGroup, activeConversation, user]);

  // Get avatar color for group members
  const getAvatarColor = useCallback((senderId) => {
    const colors = [
      'var(--accent-cyan)', 'var(--accent-green)', 'var(--accent-amber)',
      '#e879f9', '#fb923c', '#a78bfa', '#f472b6', '#34d399',
    ];
    if (!senderId) return colors[0];
    let hash = 0;
    for (let i = 0; i < senderId.length; i++) {
      hash = senderId.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
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

  // Handle call buttons
  const handleAudioCall = () => {
    if (!activeConversation || isGroup) return;
    initiateCall(
      activeConversation.id,
      'audio',
      activeConversation.other_user_id,
      activeConversation.other_username
    );
  };

  const handleVideoCall = () => {
    if (!activeConversation || isGroup) return;
    initiateCall(
      activeConversation.id,
      'video',
      activeConversation.other_user_id,
      activeConversation.other_username
    );
  };

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
              <span className="feature-icon">📞</span>
              <span className="feature-label">Voice & Video</span>
            </div>
            <div className="chat-empty-feature">
              <span className="feature-icon">👥</span>
              <span className="feature-label">Group Chats</span>
            </div>
            <div className="chat-empty-feature">
              <span className="feature-icon">👻</span>
              <span className="feature-label">Disappearing</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const headerName = isGroup ? activeConversation.group_name : activeConversation.other_username;
  const headerSubtext = isGroup
    ? `${activeConversation.members?.length || 0} members`
    : typingInfo ? 'typing...' : isOnline ? 'online' : 'offline';

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
          <div className="conversation-avatar" style={{
            width: 36, height: 36, minWidth: 36, fontSize: 13,
            background: isGroup ? 'linear-gradient(135deg, var(--accent-cyan), var(--accent-green))' : undefined,
          }}>
            {isGroup ? '👥' : (headerName?.slice(0, 2).toUpperCase())}
            {!isGroup && <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />}
          </div>
          <div>
            <div className="chat-header-name">{headerName}</div>
            <div className={`chat-header-status ${isOnline ? 'online' : ''}`}>
              {headerSubtext}
            </div>
          </div>
        </div>
        <div className="chat-header-actions">
          {/* Call buttons (1-on-1 only) */}
          {!isGroup && (
            <>
              <button
                className="icon-btn call-btn"
                onClick={handleAudioCall}
                title="Audio call"
                type="button"
              >
                📞
              </button>
              <button
                className="icon-btn call-btn"
                onClick={handleVideoCall}
                title="Video call"
                type="button"
              >
                📹
              </button>
            </>
          )}
          <span className="e2ee-badge">🔒 E2EE</span>
        </div>
      </div>

      {/* Messages */}
      <div className="chat-messages">
        {isDecrypting && decryptedMessages.length === 0 ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
            <span className="spinner" style={{ color: 'var(--accent-cyan)' }} />
          </div>
        ) : (
          <>
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
              const senderName = getSenderName(msg.sender_id);

              return (
                <div key={msg.id} className={`message-row ${isSent ? 'sent' : 'received'}`}>
                  <div className="message-bubble">
                    {/* Sender name for group messages */}
                    {isGroup && senderName && (
                      <div
                        className="message-sender-name"
                        style={{ color: getAvatarColor(msg.sender_id) }}
                      >
                        {senderName}
                      </div>
                    )}
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
