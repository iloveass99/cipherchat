# CipherChat — Encrypted Messaging

End-to-end encrypted messaging app. Your messages, your privacy.

## Features
- 🔒 End-to-end encryption (ECDH + AES-256-GCM)
- 👻 Disappearing messages
- 🛡️ Zero-knowledge server — we never see your messages
- 🚫 No email or phone required
- ⚡ Real-time messaging via WebSocket

## Quick Start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com)

1. Push this repo to GitHub
2. Connect Railway to your GitHub repo
3. Railway auto-detects the setup — no config needed
4. Set the `JWT_SECRET` environment variable in Railway dashboard

## Tech Stack
- **Frontend**: Next.js 16 + React 19
- **Real-time**: Socket.io
- **Encryption**: Web Crypto API (ECDH P-256 + AES-256-GCM)
- **Database**: SQLite (better-sqlite3)
- **Auth**: Anonymous (username + passphrase)
