'use client';

/**
 * CipherChat — User Search Modal
 * Search and start conversations with other users
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useChat } from '@/context/ChatContext';

export default function UserSearch({ isOpen, onClose }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [starting, setStarting] = useState(null); // userId being connected to
  const searchTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  const { user, startConversation, selectConversation, onlineUsers } = useChat();

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setResults([]);
    }
  }, [isOpen]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim() || !user) {
      setResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `/api/users?search=${encodeURIComponent(q)}&userId=${user.id}`
      );
      const data = await res.json();
      if (res.ok) {
        setResults(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  }, [user]);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);

    // Debounce search
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }
    searchTimeoutRef.current = setTimeout(() => doSearch(val), 300);
  };

  const handleStartChat = async (otherUser) => {
    setStarting(otherUser.id);
    try {
      const conv = await startConversation(otherUser.id);
      if (conv) {
        selectConversation(conv);
        onClose();
      }
    } catch (err) {
      console.error('Start conversation error:', err);
    } finally {
      setStarting(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">New Conversation</h2>
          <button className="modal-close" onClick={onClose} type="button">✕</button>
        </div>

        <div className="modal-body">
          <input
            ref={inputRef}
            className="modal-search-input"
            type="text"
            placeholder="Search by username..."
            value={query}
            onChange={handleInputChange}
          />

          <div className="user-search-results">
            {searching ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
                <span className="spinner" style={{ color: 'var(--accent-cyan)' }} />
              </div>
            ) : results.length > 0 ? (
              results.map(u => (
                <div key={u.id} className="user-search-item">
                  <div className="conversation-avatar" style={{ width: 40, height: 40, minWidth: 40, fontSize: 14 }}>
                    {u.username.slice(0, 2).toUpperCase()}
                    <span className={`status-dot ${onlineUsers.has(u.id) ? 'online' : 'offline'}`} />
                  </div>
                  <span className="user-search-name">{u.username}</span>
                  <button
                    className="user-search-action"
                    onClick={() => handleStartChat(u)}
                    disabled={starting === u.id}
                    type="button"
                  >
                    {starting === u.id ? (
                      <span className="spinner" style={{ width: 14, height: 14 }} />
                    ) : (
                      'Message'
                    )}
                  </button>
                </div>
              ))
            ) : query.trim() ? (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-tertiary)' }}>
                No users found matching &ldquo;{query}&rdquo;
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                Type a username to search
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
