/**
 * CipherChat — Auth API
 * POST /api/auth — { action: 'register' | 'login', username, password, publicKey? }
 */

import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'cipherchat-dev-secret-change-in-production';

function getDB() {
  // Use the global db instance set by custom server
  if (global.__db) return global.__db;
  
  // Fallback for dev
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
    const { action, username, password, publicKey } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: 'Username and password are required' },
        { status: 400 }
      );
    }

    if (username.length < 3 || username.length > 30) {
      return NextResponse.json(
        { error: 'Username must be 3-30 characters' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const db = getDB();

    if (action === 'register') {
      if (!publicKey) {
        return NextResponse.json(
          { error: 'Public key is required for registration' },
          { status: 400 }
        );
      }

      // Check if username exists
      const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
      if (existing) {
        return NextResponse.json(
          { error: 'Username already taken' },
          { status: 409 }
        );
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 12);
      const userId = uuidv4();

      // Create user
      db.prepare(
        'INSERT INTO users (id, username, password_hash, public_key) VALUES (?, ?, ?, ?)'
      ).run(userId, username, passwordHash, JSON.stringify(publicKey));

      // Generate JWT
      const token = jwt.sign({ userId, username }, JWT_SECRET, { expiresIn: '7d' });

      return NextResponse.json({
        success: true,
        user: { id: userId, username },
        token,
      });

    } else if (action === 'login') {
      // Find user
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user) {
        return NextResponse.json(
          { error: 'Invalid username or password' },
          { status: 401 }
        );
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid username or password' },
          { status: 401 }
        );
      }

      // Generate JWT
      const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });

      return NextResponse.json({
        success: true,
        user: { id: user.id, username: user.username },
        token,
        publicKey: JSON.parse(user.public_key),
      });

    } else {
      return NextResponse.json(
        { error: 'Invalid action. Use "register" or "login"' },
        { status: 400 }
      );
    }
  } catch (error) {
    console.error('Auth error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
