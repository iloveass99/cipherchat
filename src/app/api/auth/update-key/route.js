/**
 * CipherChat — Update Wrapped Key API
 * POST /api/auth/update-key — Update the password-wrapped private key on the server
 * Called after account recovery to re-wrap the key with the new password
 */

import { NextResponse } from 'next/server';
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
  global.__db = db;
  return db;
}

export async function POST(request) {
  try {
    const { userId, token, wrappedPrivateKey } = await request.json();

    if (!userId || !token || !wrappedPrivateKey) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify JWT
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      if (decoded.userId !== userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const db = getDB();
    db.prepare('UPDATE users SET wrapped_private_key = ? WHERE id = ?')
      .run(JSON.stringify(wrappedPrivateKey), userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Update key error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
