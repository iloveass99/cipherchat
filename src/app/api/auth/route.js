/**
 * CipherChat — Auth API (with Account Recovery)
 * POST /api/auth — { action: 'register' | 'login' | 'recover', ... }
 * 
 * Recovery flow: User enters username + recovery key → gets a new password set.
 * The private key is unwrapped using the recovery key, then re-wrapped with the new password.
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cipherchat-dev-secret-change-in-production';

function getDB() {
  if (global.__db) return global.__db;
  const Database = require('better-sqlite3');
  const path = require('path');
  const fs = require('fs');
  const dbPath = path.join(process.cwd(), 'data', 'cipherchat.db');
  const dataDir = path.dirname(dbPath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  global.__db = db;
  return db;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, username, password } = body;

    if (!username) {
      return NextResponse.json({ error: 'Username is required' }, { status: 400 });
    }

    const db = getDB();

    // ========== REGISTER ==========
    if (action === 'register') {
      const { publicKey, wrappedPrivateKey, recoveryKey, recoveryWrappedKey } = body;

      if (!password || password.length < 6) {
        return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 });
      }
      if (!publicKey) {
        return NextResponse.json({ error: 'Public key is required' }, { status: 400 });
      }
      if (username.length < 3 || username.length > 30) {
        return NextResponse.json({ error: 'Username must be 3-30 characters' }, { status: 400 });
      }

      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const userId = uuidv4();

      // Hash the recovery key for server-side verification
      const recoveryKeyHash = recoveryKey ? await bcrypt.hash(recoveryKey, 10) : null;

      db.prepare(
        `INSERT INTO users (id, username, password_hash, public_key, wrapped_private_key, recovery_key_hash, recovery_wrapped_key) 
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        userId, username, passwordHash,
        JSON.stringify(publicKey),
        wrappedPrivateKey ? JSON.stringify(wrappedPrivateKey) : null,
        recoveryKeyHash,
        recoveryWrappedKey ? JSON.stringify(recoveryWrappedKey) : null
      );

      const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });

      return NextResponse.json({
        success: true,
        user: { id: userId, username },
        token,
      });
    }

    // ========== LOGIN ==========
    if (action === 'login') {
      if (!password) {
        return NextResponse.json({ error: 'Password is required' }, { status: 400 });
      }

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user) {
        return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
      }

      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      return NextResponse.json({
        success: true,
        user: { id: user.id, username: user.username },
        token,
        publicKey: JSON.parse(user.public_key),
        wrappedPrivateKey: user.wrapped_private_key ? JSON.parse(user.wrapped_private_key) : null,
      });
    }

    // ========== RECOVER (Forgot Password) ==========
    if (action === 'recover') {
      const { recoveryKey, newPassword } = body;

      if (!recoveryKey) {
        return NextResponse.json({ error: 'Recovery key is required' }, { status: 400 });
      }
      if (!newPassword || newPassword.length < 6) {
        return NextResponse.json({ error: 'New password must be at least 6 characters' }, { status: 400 });
      }

      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user) {
        return NextResponse.json({ error: 'Account not found' }, { status: 404 });
      }

      if (!user.recovery_key_hash) {
        return NextResponse.json({ error: 'No recovery key set for this account' }, { status: 400 });
      }

      // Verify recovery key
      const recoveryValid = await bcrypt.compare(recoveryKey.replace(/-/g, ''), user.recovery_key_hash);
      if (!recoveryValid) {
        return NextResponse.json({ error: 'Invalid recovery key' }, { status: 401 });
      }

      // Hash new password and update
      const newPasswordHash = await bcrypt.hash(newPassword, 12);
      db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newPasswordHash, user.id);

      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      return NextResponse.json({
        success: true,
        user: { id: user.id, username: user.username },
        token,
        publicKey: JSON.parse(user.public_key),
        // Send back the recovery-wrapped key so client can unwrap with recovery key 
        // and re-wrap with new password
        recoveryWrappedKey: user.recovery_wrapped_key ? JSON.parse(user.recovery_wrapped_key) : null,
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
