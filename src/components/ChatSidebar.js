'use client';

/**
 * CipherChat — Chat Sidebar
 * Conversation list with search, online indicators, and unread badges
 */

import { useState, useEffect, useCallback } from 'react';
import { useChat } from '@/context/ChatContext';

export default function ChatSidebar({ onOpenSearch }) {
  const {
    user,
    conversations,
    activeConversation,
    selectConversation,
    onlineUsers,
    typingUsers,
    logout,
    decryptMessageContent,
  } = useChat();

  const [searchQuery, setSearchQuery] = useState('');
  const [decryptedPreviews, setDecryptedPreviews] = useState({});

  // Decrypt last message previews
  useEffect(() => {
    async function decryptPreviews() {
      const previews = {};
      for (const conv of conversations) {
        if (conv.last_message_content && conv.last_message_iv) {
          try {
            const text = await decryptMessageContent(
              conv.last_message_content,
              conv.last_message_iv,
              conv.id,
              conv.other_public_key
            );
            previews[conv.id] = text.length > 40 ? text.slice(0, 40) + '...' : text;
          } catch {
            previews[conv.id] = '🔒 Encrypted message';
          }
        }
      }
      setDecryptedPreviews(previews);
    }

    if (conversations.length > 0) {
      decryptPreviews();
    }
  }, [conversations, decryptMessageContent]);

  const filteredConversations = conversations.filter(conv =>
    conv.other_username?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const formatTime = useCallback((timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return 'now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }, []);

  const getInitials = (name) => {
    if (!name) return '?';
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="sidebar">
      {/* Header */}
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="sidebar-logo-icon">🔒</div>
          <span className="sidebar-logo-text">CipherChat</span>
        </div>
        <div className="sidebar-actions">
          <button
            className="icon-btn"
            onClick={onOpenSearch}
            title="New conversation"
            type="button"
          >
            ✏️
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="sidebar-search">
        <div className="search-wrapper">
          <span className="search-icon">🔍</span>
          <input
            className="search-input"
            type="text"
            placeholder="Search conversations..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Conversation list */}
      <div className="conversation-list">
        {filteredConversations.length === 0 ? (
          <div className="empty-conversations">
            <div className="empty-conversations-icon">💬</div>
            <p className="empty-conversations-text">
              {searchQuery
                ? 'No conversations match your search'
                : 'No conversations yet. Start one by clicking ✏️ above.'}
            </p>
          </div>
        ) : (
          filteredConversations.map(conv => {
            const isOnline = onlineUsers.has(conv.other_user_id);
            const isActive = activeConversation?.id === conv.id;
            const isTyping = typingUsers[conv.id];

            return (
              <div
                key={conv.id}
                className={`conversation-item ${isActive ? 'active' : ''}`}
                onClick={() => selectConversation(conv)}
              >
                <div className="conversation-avatar">
                  {getInitials(conv.other_username)}
                  <span className={`status-dot ${isOnline ? 'online' : 'offline'}`} />
                </div>

                <div className="conversation-info">
                  <div className="conversation-name">{conv.other_username}</div>
                  <div className="conversation-preview">
                    {isTyping ? (
                      <span style={{ color: 'var(--accent-cyan)', fontStyle: 'italic' }}>
                        typing...
                      </span>
                    ) : conv.last_message_sender === user?.id ? (
                      <>
                        <span style={{ color: 'var(--text-muted)' }}>You: </span>
                        {decryptedPreviews[conv.id] || '🔒 Encrypted'}
                      </>
                    ) : (
                      decryptedPreviews[conv.id] || (conv.last_message_content ? '🔒 Encrypted' : 'Start a conversation')
                    )}
                  </div>
                </div>

                <div className="conversation-meta">
                  {conv.last_message_time && (
                    <span className="conversation-time">
                      {formatTime(conv.last_message_time)}
                    </span>
                  )}
                  {conv.unread_count > 0 && (
                    <span className="unread-badge">{conv.unread_count}</span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer - User info */}
      <div className="sidebar-footer">
        <div className="conversation-avatar" style={{ width: 36, height: 36, minWidth: 36, fontSize: 13 }}>
          {getInitials(user?.username)}
        </div>
        <div className="user-info">
          <div className="user-name">{user?.username}</div>
          <div className="user-status">
            <span className="user-status-dot" />
            Online
          </div>
        </div>
        <button className="logout-btn" onClick={logout} type="button">
          Logout
        </button>
      </div>
    </div>
  );
}
