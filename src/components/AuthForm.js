'use client';

/**
 * CipherChat — Auth Form Component
 * Login & Register with glassmorphism design
 */

import { useState } from 'react';
import { useChat } from '@/context/ChatContext';

export default function AuthForm() {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, register, authError } = useChat();

  const passwordStrength = getPasswordStrength(password);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    if (mode === 'register') {
      await register(username, password);
    } else {
      await login(username, password);
    }

    setLoading(false);
  }

  return (
    <div className="auth-page">
      <div className="animated-bg" />
      <div className="grid-overlay" />

      <div className="auth-container">
        <div className="auth-header">
          <div className="auth-logo">
            <div className="auth-logo-icon">🔒</div>
            <span className="auth-logo-text">CipherChat</span>
          </div>
          <p className="auth-subtitle">
            End-to-end encrypted messaging.
            <br />
            Your messages, your privacy.
          </p>
        </div>

        <div className="auth-card">
          <div className="auth-tabs">
            <button
              className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
              onClick={() => { setMode('login'); }}
              type="button"
            >
              Sign In
            </button>
            <button
              className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
              onClick={() => { setMode('register'); }}
              type="button"
            >
              Create Account
            </button>
          </div>

          {authError && <div className="auth-error">{authError}</div>}

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="auth-username">Username</label>
              <div className="form-input-wrapper">
                <span className="form-input-icon">👤</span>
                <input
                  id="auth-username"
                  className="form-input"
                  type="text"
                  placeholder={mode === 'register' ? 'Choose a username' : 'Enter your username'}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  autoComplete="username"
                  required
                  minLength={3}
                  maxLength={30}
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="auth-password">
                {mode === 'register' ? 'Passphrase' : 'Password'}
              </label>
              <div className="form-input-wrapper">
                <span className="form-input-icon">🔑</span>
                <input
                  id="auth-password"
                  className="form-input"
                  type="password"
                  placeholder={mode === 'register' ? 'Create a strong passphrase' : 'Enter your password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  required
                  minLength={6}
                />
              </div>
              {mode === 'register' && password.length > 0 && (
                <>
                  <div className="password-strength">
                    {[1, 2, 3, 4].map(i => (
                      <div
                        key={i}
                        className={`password-strength-bar ${i <= passwordStrength.score ? `active ${passwordStrength.level}` : ''}`}
                      />
                    ))}
                  </div>
                  <span className="password-strength-text">{passwordStrength.text}</span>
                </>
              )}
            </div>

            <button className="auth-btn" type="submit" disabled={loading}>
              {loading ? (
                <span className="spinner" />
              ) : mode === 'register' ? (
                'Create Encrypted Account'
              ) : (
                'Sign In'
              )}
            </button>
          </form>

          <div className="privacy-badge">
            <span className="privacy-badge-icon">🛡️</span>
            {mode === 'register'
              ? 'No email or phone required. Zero data collected.'
              : 'Your messages are end-to-end encrypted.'}
          </div>
        </div>
      </div>
    </div>
  );
}

function getPasswordStrength(password) {
  if (!password) return { score: 0, level: '', text: '' };

  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/[0-9]/.test(password) || /[^A-Za-z0-9]/.test(password)) score++;

  const levels = ['', 'weak', 'medium', 'strong', 'strong'];
  const texts = ['', 'Weak', 'Fair', 'Strong', 'Very Strong'];

  return { score, level: levels[score], text: texts[score] };
}
