'use client';

/**
 * CipherChat — Profile Editor Modal
 * Edit display name, avatar, and bio
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { useChat } from '@/context/ChatContext';

export default function ProfileEditor({ isOpen, onClose }) {
  const { user, updateProfile } = useChat();

  const [displayName, setDisplayName] = useState('');
  const [bio, setBio] = useState('');
  const [avatarPreview, setAvatarPreview] = useState(null);
  const [avatarData, setAvatarData] = useState(undefined); // undefined = no change, null = remove, string = new
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const fileInputRef = useRef(null);

  // Initialize form when modal opens (useEffect avoids setState-during-render)
  useEffect(() => {
    if (isOpen && !initialized && user) {
      setDisplayName(user.displayName || '');
      setBio(user.bio || '');
      setAvatarPreview(user.avatarUrl || null);
      setAvatarData(undefined);
      setError('');
      setSuccess(false);
      setInitialized(true);
    }
    if (!isOpen && initialized) {
      setInitialized(false);
    }
  }, [isOpen, initialized, user]);

  const handleAvatarSelect = useCallback((e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('Image must be less than 5MB');
      return;
    }

    setError('');

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new window.Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_SIZE = 200;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_SIZE) {
            height = Math.round((height * MAX_SIZE) / width);
            width = MAX_SIZE;
          }
        } else {
          if (height > MAX_SIZE) {
            width = Math.round((width * MAX_SIZE) / height);
            height = MAX_SIZE;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setAvatarPreview(dataUrl);
        setAvatarData(dataUrl);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  }, []);

  const handleRemoveAvatar = useCallback(() => {
    setAvatarPreview(null);
    setAvatarData(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    setSuccess(false);

    const profileData = {
      displayName: displayName.trim() || null,
      bio: bio.trim() || null,
    };

    if (avatarData !== undefined) {
      profileData.avatarUrl = avatarData;
    }

    const ok = await updateProfile(profileData);

    if (ok) {
      setSuccess(true);
      setTimeout(() => {
        setSuccess(false);
        onClose();
      }, 1000);
    } else {
      setError('Failed to save profile. Please try again.');
    }

    setSaving(false);
  }, [displayName, bio, avatarData, updateProfile, onClose]);

  const handleClose = useCallback(() => {
    setInitialized(false);
    setDisplayName('');
    setBio('');
    setAvatarPreview(null);
    setAvatarData(undefined);
    setError('');
    setSuccess(false);
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const getInitials = (name) => {
    if (!name) return '?';
    return name.slice(0, 2).toUpperCase();
  };

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div className="modal-content profile-editor-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2 className="modal-title">Edit Profile</h2>
          <button className="modal-close" onClick={handleClose} type="button">✕</button>
        </div>

        <div className="modal-body profile-editor-body">
          {/* Avatar Section */}
          <div className="profile-avatar-section">
            <div
              className="profile-avatar-upload"
              onClick={() => fileInputRef.current?.click()}
              title="Click to change avatar"
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="Avatar" className="profile-avatar-img" />
              ) : (
                <div className="profile-avatar-placeholder">
                  {getInitials(displayName || user?.username)}
                </div>
              )}
              <div className="profile-avatar-overlay">
                <span>📷</span>
              </div>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleAvatarSelect}
              style={{ display: 'none' }}
            />

            <div className="profile-avatar-actions">
              <button
                className="profile-avatar-btn"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Upload Photo
              </button>
              {avatarPreview && (
                <button
                  className="profile-avatar-btn remove"
                  onClick={handleRemoveAvatar}
                  type="button"
                >
                  Remove
                </button>
              )}
            </div>
          </div>

          {/* Username (read-only) */}
          <div className="profile-field">
            <label className="profile-field-label">Username</label>
            <div className="profile-username-display">
              <span className="profile-username-at">@</span>
              <span>{user?.username}</span>
            </div>
          </div>

          {/* Display Name */}
          <div className="profile-field">
            <label className="profile-field-label" htmlFor="profile-display-name">
              Display Name
            </label>
            <input
              id="profile-display-name"
              className="profile-field-input"
              type="text"
              placeholder="How you want to be seen"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
              maxLength={40}
            />
            <span className="profile-field-counter">{displayName.length}/40</span>
          </div>

          {/* Bio */}
          <div className="profile-field">
            <label className="profile-field-label" htmlFor="profile-bio">
              Bio
            </label>
            <textarea
              id="profile-bio"
              className="profile-field-input profile-bio-input"
              placeholder="Tell something about yourself..."
              value={bio}
              onChange={(e) => setBio(e.target.value.slice(0, 150))}
              maxLength={150}
              rows={3}
            />
            <span className="profile-field-counter">{bio.length}/150</span>
          </div>

          {/* Error / Success */}
          {error && <div className="profile-error">{error}</div>}
          {success && <div className="profile-success">✅ Profile saved!</div>}

          {/* Save */}
          <button
            className="auth-btn profile-save-btn"
            onClick={handleSave}
            disabled={saving}
            type="button"
          >
            {saving ? <span className="spinner" /> : 'Save Profile'}
          </button>
        </div>
      </div>
    </div>
  );
}
