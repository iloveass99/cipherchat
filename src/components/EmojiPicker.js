'use client';

/**
 * CipherChat — Emoji Picker
 * Categorized emoji grid with search and recent emojis
 */

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';

const EMOJI_CATEGORIES = {
  'Recent': [],
  '😀 Smileys': [
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍',
    '🤩','😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫',
    '🤔','🫡','🤐','🤨','😐','😑','😶','🫥','😏','😒','🙄','😬','🤥','😌','😔',
    '😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥴','😵','🤯','🥱','😤','😡','🤬',
    '😈','👿','💀','☠️','💩','🤡','👹','👺','👻','👽','👾','🤖','😺','😸','😹',
    '😻','😼','😽','🙀','😿','😾',
  ],
  '👋 Gestures': [
    '👋','🤚','🖐️','✋','🖖','🫱','🫲','🫳','🫴','👌','🤌','🤏','✌️','🤞','🫰',
    '🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','🫵','👍','👎','✊','👊','🤛',
    '🤜','👏','🙌','🫶','👐','🤲','🙏','💪','🦾','🦿','🦵','🦶','👂','🦻','👃',
    '🧠','🫀','🫁','🦷','🦴','👀','👁️','👅','👄',
  ],
  '❤️ Hearts': [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❤️‍🔥','❤️‍🩹','❣️','💕',
    '💞','💓','💗','💖','💘','💝','💟','♥️','💋','💌','💐','🌹','🥀','🌺','🌸',
  ],
  '🐶 Animals': [
    '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷',
    '🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🐣','🐥','🦆','🦅','🦉',
    '🦇','🐺','🐗','🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🪲','🪳','🦟','🦗',
    '🐍','🦎','🦖','🦕','🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋',
  ],
  '🍔 Food': [
    '🍎','🍐','🍊','🍋','🍌','🍉','🍇','🍓','🫐','🍈','🍒','🍑','🥭','🍍','🥥',
    '🥝','🍅','🍆','🥑','🥦','🥬','🥒','🌶️','🫑','🌽','🥕','🫒','🧄','🧅','🥔',
    '🍠','🥐','🥯','🍞','🥖','🥨','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗',
    '🍖','🌭','🍔','🍟','🍕','🫓','🥪','🥙','🧆','🌮','🌯','🫔','🥗','🍝','🍜',
    '🍲','🍛','🍣','🍱','🥟','🦪','🍤','🍙','🍚','🍘','🍥','🥮','🍧','🍨','🍦',
    '🥧','🧁','🍰','🎂','🍮','🍭','🍬','🍫','🍩','🍪','🍯','☕','🫖','🍵','🧃',
    '🥤','🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾',
  ],
  '⚽ Activities': [
    '⚽','🏀','🏈','⚾','🥎','🎾','🏐','🏉','🥏','🎱','🏓','🏸','🏒','🥅','⛳',
    '🏹','🎣','🤿','🥊','🥋','🎿','⛷️','🏂','🪂','🏋️','🤸','🤼','🤾','🏌️','🏇',
    '🧘','🏄','🏊','🤽','🚣','🧗','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🏵️','🎗️',
    '🎪','🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🪗','🎸','🪕','🎻',
  ],
  '🚗 Travel': [
    '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️',
    '🛵','🚲','🛴','🛹','🏍️','✈️','🛩️','🚀','🛸','🚁','⛵','🚤','🛥️','🛳️','⛴️',
    '🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🏠','🏡','🏘️','🏢','🏣','🏤','🏥',
    '🏦','🏨','🏩','🏪','🏫','🏬','🏭','🏯','🏰','🗼','🗽','⛪','🕌','🛕','🕍',
  ],
  '💡 Objects': [
    '💡','🔦','🕯️','📱','💻','⌨️','🖥️','🖨️','🖱️','💾','💿','📀','📷','📹','🎥',
    '📞','☎️','📟','📺','📻','🎙️','⏱️','⏲️','⏰','🕰️','💣','🔫','🗡️','⚔️','🛡️',
    '🚬','⚰️','⚱️','🏺','🔮','📿','🧿','💈','⚗️','🔭','🔬','🕳️','🩹','🩺','💊',
    '💉','🩸','🧬','🦠','🧫','🧪','🌡️','🧹','🪠','🧺','🧻','🚽','🚿','🛁','🧼',
    '🪥','🪒','🧽','🧴','🔑','🗝️','🚪','🛋️','🪑','🛏️','🪞','🪟','🧲','🧰','🪛',
  ],
  '🔣 Symbols': [
    '❤️','🔥','⭐','✨','💫','🌟','⚡','💥','💢','💤','💨','💦','🎵','🎶','✅',
    '❌','⭕','🚫','💯','🔴','🟠','🟡','🟢','🔵','🟣','⚫','⚪','🟤','🔶','🔷',
    '▶️','⏸️','⏹️','⏺️','⏭️','⏮️','🔀','🔁','🔂','🔃','🔄','ℹ️','🆗','🆕','🆒',
    '🆓','🆙','🆘','❓','❗','‼️','⁉️','♻️','🔰','💠','Ⓜ️','🌀','💲','♈','♉',
  ],
  '🏁 Flags': [
    '🏁','🚩','🎌','🏴','🏳️','🏳️‍🌈','🏳️‍⚧️','🏴‍☠️','🇮🇳','🇺🇸','🇬🇧','🇨🇦',
    '🇦🇺','🇩🇪','🇫🇷','🇯🇵','🇰🇷','🇧🇷','🇷🇺','🇨🇳','🇮🇹','🇪🇸','🇲🇽',
  ],
};

const CATEGORY_NAMES = Object.keys(EMOJI_CATEGORIES);

export default function EmojiPicker({ onSelect, onClose }) {
  const [activeCategory, setActiveCategory] = useState(CATEGORY_NAMES[1]); // Skip 'Recent'
  const [search, setSearch] = useState('');
  const [recentEmojis, setRecentEmojis] = useState([]);
  const pickerRef = useRef(null);

  // Load recent emojis
  useEffect(() => {
    try {
      const saved = localStorage.getItem('cipherchat_recent_emojis');
      if (saved) setRecentEmojis(JSON.parse(saved));
    } catch {}
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose]);

  const handleSelect = useCallback((emoji) => {
    onSelect?.(emoji);

    // Update recent emojis
    setRecentEmojis(prev => {
      const updated = [emoji, ...prev.filter(e => e !== emoji)].slice(0, 24);
      try {
        localStorage.setItem('cipherchat_recent_emojis', JSON.stringify(updated));
      } catch {}
      return updated;
    });
  }, [onSelect]);

  // Filtered emojis for search
  const displayEmojis = useMemo(() => {
    if (search.trim()) {
      // Simple search: gather all emojis
      const all = [];
      for (const [cat, emojis] of Object.entries(EMOJI_CATEGORIES)) {
        if (cat === 'Recent') continue;
        all.push(...emojis);
      }
      return [...new Set(all)];
    }

    if (activeCategory === 'Recent') {
      return recentEmojis;
    }

    return EMOJI_CATEGORIES[activeCategory] || [];
  }, [search, activeCategory, recentEmojis]);

  return (
    <div className="emoji-picker" ref={pickerRef}>
      {/* Search */}
      <div className="emoji-search">
        <input
          type="text"
          placeholder="Search emojis..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="emoji-search-input"
          autoFocus
        />
      </div>

      {/* Category tabs */}
      {!search && (
        <div className="emoji-categories">
          <button
            className={`emoji-cat-btn ${activeCategory === 'Recent' ? 'active' : ''}`}
            onClick={() => setActiveCategory('Recent')}
            title="Recent"
          >
            🕐
          </button>
          {CATEGORY_NAMES.slice(1).map(cat => (
            <button
              key={cat}
              className={`emoji-cat-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
              title={cat}
            >
              {cat.split(' ')[0]}
            </button>
          ))}
        </div>
      )}

      {/* Emoji grid */}
      <div className="emoji-grid">
        {displayEmojis.length === 0 && (
          <div className="emoji-empty">
            {activeCategory === 'Recent' ? 'No recent emojis yet' : 'No emojis found'}
          </div>
        )}
        {displayEmojis.map((emoji, i) => (
          <button
            key={`${emoji}-${i}`}
            className="emoji-item"
            onClick={() => handleSelect(emoji)}
            title={emoji}
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
