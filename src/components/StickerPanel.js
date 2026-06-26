'use client';

/**
 * CipherChat — Sticker Panel
 * Display saved stickers and create new ones
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { getStickers, saveSticker, deleteSticker } from '@/lib/keystore';
import StickerMaker from './StickerMaker';

export default function StickerPanel({ onSelect, onClose }) {
  const [stickers, setStickers] = useState([]);
  const [showMaker, setShowMaker] = useState(false);
  const [loading, setLoading] = useState(true);
  const panelRef = useRef(null);

  // Load stickers
  useEffect(() => {
    loadStickers();
  }, []);

  const loadStickers = async () => {
    try {
      const saved = await getStickers();
      setStickers(saved.sort((a, b) => b.createdAt - a.createdAt));
    } catch (err) {
      console.error('Error loading stickers:', err);
    } finally {
      setLoading(false);
    }
  };

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target) && !showMaker) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, showMaker]);

  const handleSaveSticker = useCallback(async (id, imageData) => {
    try {
      await saveSticker(id, imageData, `Sticker ${stickers.length + 1}`);
      await loadStickers();
      setShowMaker(false);
    } catch (err) {
      console.error('Error saving sticker:', err);
    }
  }, [stickers.length]);

  const handleDeleteSticker = useCallback(async (id, e) => {
    e.stopPropagation();
    if (confirm('Delete this sticker?')) {
      try {
        await deleteSticker(id);
        setStickers(prev => prev.filter(s => s.id !== id));
      } catch (err) {
        console.error('Error deleting sticker:', err);
      }
    }
  }, []);

  if (showMaker) {
    return (
      <StickerMaker
        onSave={handleSaveSticker}
        onClose={() => setShowMaker(false)}
      />
    );
  }

  return (
    <div className="sticker-panel" ref={panelRef}>
      <div className="sticker-panel-header">
        <span className="sticker-panel-title">🎨 My Stickers</span>
        <button
          className="sticker-create-btn"
          onClick={() => setShowMaker(true)}
        >
          + Create
        </button>
      </div>

      <div className="sticker-grid">
        {loading && <div className="sticker-loading">Loading...</div>}

        {!loading && stickers.length === 0 && (
          <div className="sticker-empty">
            <span>🎨</span>
            <span>No stickers yet!</span>
            <button
              className="sticker-create-first"
              onClick={() => setShowMaker(true)}
            >
              Create your first sticker
            </button>
          </div>
        )}

        {stickers.map(sticker => (
          <div
            key={sticker.id}
            className="sticker-item"
            onClick={() => onSelect?.(sticker)}
            title="Click to send"
          >
            <img
              src={sticker.imageData}
              alt={sticker.name}
              className="sticker-img"
            />
            <button
              className="sticker-delete-btn"
              onClick={(e) => handleDeleteSticker(sticker.id, e)}
              title="Delete"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
