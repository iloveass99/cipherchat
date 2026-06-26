'use client';

/**
 * CipherChat — Auth Form Component (with Account Recovery)
 * Login, Register, Forgot Password, and Recovery Key Display
 */

import { useState, useRef } from 'react';
import { useChat } from '@/context/ChatContext';

export default function AuthForm() {
  const [mode, setMode] = useState('login'); // 'login' | 'register' | 'recover'
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRecoveryKey, setShowRecoveryKey] = useState(null); // The key to display after registration
  const [keyCopied, setKeyCopied] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const completeRegRef = useRef(null); // Callback to finalize registration
  const { login, register, recoverAccount, authError } = useChat();

  const passwordStrength = getPasswordStrength(mode === 'recover' ? newPassword : password);

  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);

    if (mode === 'register') {
      const result = await register(username, password);
      if (result?.success && result.recoveryKey) {
        setShowRecoveryKey(result.recoveryKey);
        completeRegRef.current = result.completeRegistration;
      }
    } else if (mode === 'recover') {
      await recoverAccount(username, recoveryKey, newPassword);
    } else {
      await login(username, password);
    }

    setLoading(false);
  }

  async function copyRecoveryKey() {
    if (showRecoveryKey) {
      try {
        await navigator.clipboard.writeText(showRecoveryKey);
        setKeyCopied(true);
        setTimeout(() => setKeyCopied(false), 2000);
      } catch {
        // Fallback: select the text
        const el = document.getElementById('recovery-key-display');
        if (el) {
          const range = document.createRange();
          range.selectNodeContents(el);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
        }
      }
    }
  }

  // Recovery Key Display Modal (shown once after registration)
  if (showRecoveryKey) {
    return (
      <div className="auth-page">
        <div className="animated-bg" />
        <div className="grid-overlay" />

        <div className="auth-container">
          <div className="auth-card recovery-card">
            <div className="recovery-header">
              <div className="recovery-icon">🔑</div>
              <h2 className="recovery-title">Save Your Recovery Key</h2>
              <p className="recovery-subtitle">
                This is the <strong>ONLY</strong> way to recover your account if you forget your password.
                Write it down or save it somewhere safe. It will never be shown again.
              </p>
            </div>

            <div className="recovery-key-box">
              <code id="recovery-key-display" className="recovery-key-text">
                {showRecoveryKey}
              </code>
              <button
                className="recovery-copy-btn"
                onClick={copyRecoveryKey}
                type="button"
              >
                {keyCopied ? '✅ Copied!' : '📋 Copy'}
              </button>
            </div>

            <div className="recovery-warnings">
              <div className="recovery-warning-item">
                <span>⚠️</span>
                <span>We do NOT store this key. If you lose it, you cannot recover your account.</span>
              </div>
              <div className="recovery-warning-item">
                <span>🔒</span>
                <span>Never share this key with anyone — not even CipherChat support.</span>
              </div>
              <div className="recovery-warning-item">
                <span>📝</span>
                <span>Write it on paper and keep it in a safe place.</span>
              </div>
            </div>

            <label className="recovery-confirm-label">
              <input
                type="checkbox"
                checked={keySaved}
                onChange={(e) => setKeySaved(e.target.checked)}
              />
              <span>I have saved my recovery key in a safe place</span>
            </label>

            <button
              className="auth-btn"
              onClick={async () => {
                if (completeRegRef.current) {
                  await completeRegRef.current();
                  completeRegRef.current = null;
                }
                setShowRecoveryKey(null);
              }}
              disabled={!keySaved}
              type="button"
            >
              Continue to CipherChat →
            </button>
          </div>
        </div>
      </div>
    );
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

          {mode === 'recover' ? (
            // ---- Recovery Form ----
            <form className="auth-form" onSubmit={handleSubmit}>
              <div className="recovery-form-header">
                <button
                  className="recovery-back-btn"
                  onClick={() => setMode('login')}
                  type="button"
                >
                  ← Back to Sign In
                </button>
                <h3 className="recovery-form-title">Account Recovery</h3>
                <p className="recovery-form-desc">
                  Enter your username and the recovery key you saved when creating your account.
                </p>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="recover-username">Username</label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon">👤</span>
                  <input
                    id="recover-username"
                    className="form-input"
                    type="text"
                    placeholder="Your username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    required
                    minLength={3}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="recover-key">Recovery Key</label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon">🔑</span>
                  <input
                    id="recover-key"
                    className="form-input recovery-key-input"
                    type="text"
                    placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
                    required
                    style={{ fontFamily: "'JetBrains Mono', monospace", letterSpacing: '0.05em' }}
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="recover-new-password">New Password</label>
                <div className="form-input-wrapper">
                  <span className="form-input-icon">🔐</span>
                  <input
                    id="recover-new-password"
                    className="form-input"
                    type="password"
                    placeholder="Create a new password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                  />
                </div>
                {newPassword.length > 0 && (
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
                {loading ? <span className="spinner" /> : 'Recover Account'}
              </button>
            </form>
          ) : (
            // ---- Login / Register Form ----
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

              {mode === 'login' && (
                <button
                  className="forgot-password-btn"
                  onClick={() => setMode('recover')}
                  type="button"
                >
                  Forgot your password?
                </button>
              )}
            </form>
          )}

          <div className="privacy-badge">
            <span className="privacy-badge-icon">🛡️</span>
            {mode === 'register'
              ? 'No email or phone required. Zero data collected.'
              : mode === 'recover'
              ? 'Your recovery key decrypts your private key locally.'
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
