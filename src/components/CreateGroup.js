'use client';

/**
 * CipherChat — Create Group Modal
 * Search and select users to create a group
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useChat } from '@/context/ChatContext';

export default function CreateGroup({ isOpen, onClose }) {
  const [groupName, setGroupName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [searching, setSearching] = useState(false);
  const [creating, setCreating] = useState(false);
  const searchTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  const { user, createGroup } = useChat();

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setGroupName('');
      setSearchQuery('');
      setSearchResults([]);
      setSelectedMembers([]);
    }
  }, [isOpen]);

  const doSearch = useCallback(async (q) => {
    if (!q.trim() || !user) {
      setSearchResults([]);
      return;
    }

    setSearching(true);
    try {
      const res = await fetch(
        `/api/users?search=${encodeURIComponent(q)}&userId=${user.id}`
      );
      const data = await res.json();
      if (res.ok) {
        // Filter out already selected members
        const selectedIds = new Set(selectedMembers.map(m => m.id));
        setSearchResults(
          (Array.isArray(data) ? data : []).filter(u => !selectedIds.has(u.id))
        );
      }
    } catch (err) {
      console.error('Search error:', err);
    } finally {
      setSearching(false);
    }
  }, [user, selectedMembers]);

  const handleSearchChange = (e) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => doSearch(val), 300);
  };

  const addMember = (member) => {
    setSelectedMembers(prev => [...prev, member]);
    setSearchResults(prev => prev.filter(u => u.id !== member.id));
    setSearchQuery('');
  };

  const removeMember = (memberId) => {
    setSelectedMembers(prev => prev.filter(m => m.id !== memberId));
  };

  const handleCreate = async () => {
    if (!groupName.trim() || selectedMembers.length < 1) return;

    setCreating(true);
    try {
      await createGroup(groupName.trim(), selectedMembers.map(m => m.id));
      onClose();
    } catch (err) {
      console.error('Create group error:', err);
    } finally {
      setCreating(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Create Group</h2>
          <button className="modal-close" onClick={onClose} type="button">✕</button>
        </div>

        <div className="modal-body">
          {/* Group name */}
          <div className="group-name-input-wrapper">
            <div className="group-avatar-preview">
              {groupName ? groupName.slice(0, 2).toUpperCase() : '👥'}
            </div>
            <input
              ref={inputRef}
              className="modal-search-input"
              type="text"
              placeholder="Group name..."
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              maxLength={50}
            />
          </div>

          {/* Selected members */}
          {selectedMembers.length > 0 && (
            <div className="selected-members">
              {selectedMembers.map(m => (
                <div key={m.id} className="selected-member-chip">
                  <span>{m.username}</span>
                  <button
                    className="chip-remove"
                    onClick={() => removeMember(m.id)}
                    type="button"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Member search */}
          <input
            className="modal-search-input"
            type="text"
            placeholder="Search users to add..."
            value={searchQuery}
            onChange={handleSearchChange}
            style={{ marginTop: 'var(--space-sm)' }}
          />

          <div className="user-search-results">
            {searching ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-tertiary)' }}>
                <span className="spinner" style={{ color: 'var(--accent-cyan)' }} />
              </div>
            ) : searchResults.length > 0 ? (
              searchResults.map(u => (
                <div key={u.id} className="user-search-item">
                  <div className="conversation-avatar" style={{ width: 36, height: 36, minWidth: 36, fontSize: 13 }}>
                    {u.username.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="user-search-name">{u.username}</span>
                  <button
                    className="user-search-action"
                    onClick={() => addMember(u)}
                    type="button"
                  >
                    Add
                  </button>
                </div>
              ))
            ) : searchQuery.trim() ? (
              <div style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--text-tertiary)' }}>
                No users found
              </div>
            ) : null}
          </div>

          {/* Create button */}
          <button
            className="auth-btn"
            onClick={handleCreate}
            disabled={!groupName.trim() || selectedMembers.length < 1 || creating}
            type="button"
            style={{ marginTop: 'var(--space-md)' }}
          >
            {creating ? (
              <span className="spinner" />
            ) : (
              `Create Group (${selectedMembers.length + 1} members)`
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
