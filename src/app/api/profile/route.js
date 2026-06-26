/**
 * CipherChat — Profile API
 * GET /api/profile?userId=xxx — Get profile data
 * PUT /api/profile — Update profile (displayName, avatarUrl, bio)
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
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const db = getDB();
    const user = db.prepare(
      'SELECT id, username, display_name, avatar_url, bio FROM users WHERE id = ?'
    ).get(userId);

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      avatarUrl: user.avatar_url,
      bio: user.bio,
    });
  } catch (error) {
    console.error('Profile GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const { userId, displayName, avatarUrl, bio } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Validate display name
    if (displayName !== undefined && displayName !== null && displayName.length > 40) {
      return NextResponse.json({ error: 'Display name must be 40 characters or less' }, { status: 400 });
    }

    // Validate bio
    if (bio !== undefined && bio !== null && bio.length > 150) {
      return NextResponse.json({ error: 'Bio must be 150 characters or less' }, { status: 400 });
    }

    // Validate avatar size (base64 data URI, max ~150KB)
    if (avatarUrl && avatarUrl.length > 200000) {
      return NextResponse.json({ error: 'Avatar image is too large. Please use a smaller image.' }, { status: 400 });
    }

    const db = getDB();

    // Verify user exists
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Build update query dynamically
    const updates = [];
    const values = [];

    if (displayName !== undefined) {
      updates.push('display_name = ?');
      values.push(displayName || null);
    }
    if (avatarUrl !== undefined) {
      updates.push('avatar_url = ?');
      values.push(avatarUrl || null);
    }
    if (bio !== undefined) {
      updates.push('bio = ?');
      values.push(bio || null);
    }

    if (updates.length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    values.push(userId);
    db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);

    // Return updated profile
    const updated = db.prepare(
      'SELECT id, username, display_name, avatar_url, bio FROM users WHERE id = ?'
    ).get(userId);

    return NextResponse.json({
      success: true,
      user: {
        id: updated.id,
        username: updated.username,
        displayName: updated.display_name,
        avatarUrl: updated.avatar_url,
        bio: updated.bio,
      },
    });
  } catch (error) {
    console.error('Profile PUT error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
