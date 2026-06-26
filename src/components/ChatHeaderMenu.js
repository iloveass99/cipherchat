'use client';

/**
 * CipherChat — Chat Header Menu (⋮ dropdown)
 * Block/unblock, friend actions
 */

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@/context/ChatContext';

export default function ChatHeaderMenu({ conversation }) {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(null);
  const menuRef = useRef(null);

  const { blockUser, unblockUser, sendFriendRequest, removeFriend } = useChat();

  const isBlocked = conversation?.is_blocked;
  const friendStatus = conversation?.friend_status;
  const otherUserId = conversation?.other_user_id;

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleBlock = async () => {
    setLoading('block');
    if (isBlocked) {
      await unblockUser(otherUserId);
    } else {
      await blockUser(otherUserId);
    }
    setLoading(null);
    setIsOpen(false);
  };

  const handleFriend = async () => {
    setLoading('friend');
    if (friendStatus === 'accepted') {
      await removeFriend(otherUserId);
    } else if (!friendStatus) {
      await sendFriendRequest(otherUserId);
    }
    setLoading(null);
    setIsOpen(false);
  };

  return (
    <div className="chat-header-menu" ref={menuRef}>
      <button
        className="icon-btn"
        onClick={() => setIsOpen(!isOpen)}
        title="More options"
        type="button"
      >
        ⋮
      </button>

      {isOpen && (
        <div className="chat-header-dropdown">
          {/* Friend action */}
          {!isBlocked && (
            <button
              className="dropdown-item"
              onClick={handleFriend}
              disabled={loading === 'friend' || friendStatus === 'pending'}
              type="button"
            >
              <span className="dropdown-icon">
                {friendStatus === 'accepted' ? '💔' : friendStatus === 'pending' ? '⏳' : '🤝'}
              </span>
              <span>
                {loading === 'friend' ? 'Loading...'
                  : friendStatus === 'accepted' ? 'Remove Friend'
                  : friendStatus === 'pending' ? 'Request Pending'
                  : 'Add Friend'}
              </span>
            </button>
          )}

          {/* Block/Unblock */}
          <button
            className={`dropdown-item ${!isBlocked ? 'danger' : ''}`}
            onClick={handleBlock}
            disabled={loading === 'block'}
            type="button"
          >
            <span className="dropdown-icon">{isBlocked ? '✅' : '🚫'}</span>
            <span>
              {loading === 'block' ? 'Loading...' : isBlocked ? 'Unblock User' : 'Block User'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
