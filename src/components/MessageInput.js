'use client';

/**
 * CipherChat — Message Input (Phase 3)
 * Text input with emoji picker, file attachments, stickers, and disappearing timer
 */

import { useState, useRef, useCallback } from 'react';
import { useChat } from '@/context/ChatContext';
import EmojiPicker from './EmojiPicker';
import StickerPanel from './StickerPanel';

const TIMER_OPTIONS = [
  { label: 'Off', value: null, icon: '⭕' },
  { label: '30 seconds', value: 30, icon: '⏱️' },
  { label: '5 minutes', value: 300, icon: '⏱️' },
  { label: '1 hour', value: 3600, icon: '⏱️' },
  { label: '24 hours', value: 86400, icon: '⏱️' },
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export default function MessageInput() {
  const [text, setText] = useState('');
  const [disappearTimer, setDisappearTimer] = useState(null);
  const [showTimerDropdown, setShowTimerDropdown] = useState(false);
  const [sending, setSending] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showStickerPanel, setShowStickerPanel] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // 'uploading' | null
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const fileInputRef = useRef(null);

  const { activeConversation, encryptAndSend, encryptAndSendFile, sendTyping } = useChat();

  const handleTyping = useCallback(() => {
    if (!activeConversation) return;

    sendTyping(activeConversation.id, true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

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

  const handleEmojiSelect = useCallback((emoji) => {
    setText(prev => prev + emoji);
    inputRef.current?.focus();
  }, []);

  const handleFileSelect = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeConversation) return;

    if (file.size > MAX_FILE_SIZE) {
      alert('File too large. Maximum size is 10MB.');
      return;
    }

    setUploadProgress('uploading');

    try {
      await encryptAndSendFile(
        activeConversation.id,
        file,
        activeConversation.other_public_key,
        disappearTimer
      );
    } catch (err) {
      console.error('File send error:', err);
      alert(err.message || 'Failed to send file');
    } finally {
      setUploadProgress(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [activeConversation, encryptAndSendFile, disappearTimer]);

  const handleStickerSelect = useCallback(async (sticker) => {
    if (!activeConversation || sending) return;

    setSending(true);
    setShowStickerPanel(false);

    try {
      // Send sticker as a special message
      const stickerPayload = JSON.stringify({
        type: 'sticker',
        imageData: sticker.imageData,
        name: sticker.name,
      });

      await encryptAndSend(
        activeConversation.id,
        `__STICKER__${stickerPayload}`,
        activeConversation.other_public_key,
        disappearTimer
      );
    } catch (err) {
      console.error('Sticker send error:', err);
    } finally {
      setSending(false);
    }
  }, [activeConversation, encryptAndSend, disappearTimer, sending]);

  if (!activeConversation) return null;

  const activeTimer = TIMER_OPTIONS.find(t => t.value === disappearTimer);

  return (
    <>
      <div className="message-input-area">
        {/* Upload progress */}
        {uploadProgress && (
          <div className="upload-progress-bar">
            <div className="upload-progress-inner" />
            <span className="upload-progress-text">🔒 Encrypting & sending...</span>
          </div>
        )}

        <div className="message-input-wrapper">
          {/* Left buttons */}
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

            {/* Emoji button */}
            <button
              className={`input-action-btn ${showEmojiPicker ? 'active' : ''}`}
              onClick={() => {
                setShowEmojiPicker(!showEmojiPicker);
                setShowStickerPanel(false);
              }}
              title="Emoji"
              type="button"
            >
              😀
            </button>

            {/* Attachment button */}
            <button
              className="input-action-btn"
              onClick={() => fileInputRef.current?.click()}
              title="Send file, photo, or video"
              type="button"
              disabled={!!uploadProgress}
            >
              📎
            </button>

            {/* Sticker button */}
            <button
              className={`input-action-btn ${showStickerPanel ? 'active' : ''}`}
              onClick={() => {
                setShowStickerPanel(!showStickerPanel);
                setShowEmojiPicker(false);
              }}
              title="Stickers"
              type="button"
            >
              🎨
            </button>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt,.zip,.rar"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
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

      {/* Emoji Picker */}
      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => setShowEmojiPicker(false)}
        />
      )}

      {/* Sticker Panel */}
      {showStickerPanel && (
        <StickerPanel
          onSelect={handleStickerSelect}
          onClose={() => setShowStickerPanel(false)}
        />
      )}
    </>
  );
}
