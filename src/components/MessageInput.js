'use client';

/**
 * CipherChat — Message Input
 * Text input with disappearing message timer and encryption status
 */

import { useState, useRef, useCallback } from 'react';
import { useChat } from '@/context/ChatContext';

const TIMER_OPTIONS = [
  { label: 'Off', value: null, icon: '⭕' },
  { label: '30 seconds', value: 30, icon: '⏱️' },
  { label: '5 minutes', value: 300, icon: '⏱️' },
  { label: '1 hour', value: 3600, icon: '⏱️' },
  { label: '24 hours', value: 86400, icon: '⏱️' },
];

export default function MessageInput() {
  const [text, setText] = useState('');
  const [disappearTimer, setDisappearTimer] = useState(null);
  const [showTimerDropdown, setShowTimerDropdown] = useState(false);
  const [sending, setSending] = useState(false);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  const { activeConversation, encryptAndSend, sendTyping } = useChat();

  const handleTyping = useCallback(() => {
    if (!activeConversation) return;

    sendTyping(activeConversation.id, true);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Stop typing after 2 seconds of inactivity
    typingTimeoutRef.current = setTimeout(() => {
      sendTyping(activeConversation.id, false);
    }, 2000);
  }, [activeConversation, sendTyping]);

  const handleSend = useCallback(async () => {
    if (!text.trim() || !activeConversation || sending) return;

    setSending(true);

    try {
      await encryptAndSend(
        activeConversation.id,
        text.trim(),
        activeConversation.other_public_key,
        disappearTimer
      );

      setText('');
      sendTyping(activeConversation.id, false);

      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    } catch (err) {
      console.error('Send error:', err);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }, [text, activeConversation, encryptAndSend, sendTyping, disappearTimer, sending]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (!activeConversation) return null;

  const activeTimer = TIMER_OPTIONS.find(t => t.value === disappearTimer);

  return (
    <>
      <div className="message-input-area">
        <div className="message-input-wrapper">
          <div className="message-input-left">
            <div
              className={`disappearing-toggle ${disappearTimer ? 'active' : ''}`}
              onClick={() => setShowTimerDropdown(!showTimerDropdown)}
              title="Disappearing messages"
            >
              ⏱️
              {showTimerDropdown && (
                <div className="timer-dropdown">
                  {TIMER_OPTIONS.map(option => (
                    <div
                      key={option.label}
                      className={`timer-option ${disappearTimer === option.value ? 'active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setDisappearTimer(option.value);
                        setShowTimerDropdown(false);
                      }}
                    >
                      <span>{option.icon}</span>
                      {option.label}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <textarea
            ref={inputRef}
            className="message-text-input"
            placeholder={
              disappearTimer
                ? `Message (disappears in ${activeTimer?.label})...`
                : 'Type an encrypted message...'
            }
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              handleTyping();
            }}
            onKeyDown={handleKeyDown}
            rows={1}
          />

          <button
            className="send-btn"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            title="Send encrypted message"
            type="button"
          >
            {sending ? <span className="spinner" /> : '➤'}
          </button>
        </div>

        <div className="encryption-status">
          <span className="encryption-status-icon">🔒</span>
          End-to-end encrypted
          {disappearTimer && (
            <span style={{ color: 'var(--accent-amber)', marginLeft: 8 }}>
              ⏱️ {activeTimer?.label}
            </span>
          )}
        </div>
      </div>
    </>
  );
}
