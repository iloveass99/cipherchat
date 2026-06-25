/**
 * CipherChat — Messages API
 * GET /api/messages?conversationId=xxx — Get encrypted message history
 */

import { NextResponse } from 'next/server';

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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const conversationId = searchParams.get('conversationId');
    const limit = parseInt(searchParams.get('limit') || '100', 10);
    const before = searchParams.get('before');

    if (!conversationId) {
      return NextResponse.json(
        { error: 'conversationId is required' },
        { status: 400 }
      );
    }

    const db = getDB();

    let messages;
    if (before) {
      messages = db.prepare(
        'SELECT * FROM messages WHERE conversation_id = ? AND timestamp < ? ORDER BY timestamp DESC LIMIT ?'
      ).all(conversationId, parseInt(before, 10), limit).reverse();
    } else {
      messages = db.prepare(
        'SELECT * FROM messages WHERE conversation_id = ? ORDER BY timestamp DESC LIMIT ?'
      ).all(conversationId, limit).reverse();
    }

    return NextResponse.json(messages);
  } catch (error) {
    console.error('Messages API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
