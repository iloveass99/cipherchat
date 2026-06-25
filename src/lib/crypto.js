/**
 * CipherChat — End-to-End Encryption Engine
 * 
 * Uses Web Crypto API for all cryptographic operations:
 * - ECDH P-256 for key exchange
 * - AES-256-GCM for message encryption
 * - PBKDF2 for passphrase-based key derivation
 * 
 * ALL crypto runs client-side. The server never sees plaintext.
 */

// ---- Key Generation ----

/**
 * Generate an ECDH key pair for key exchange
 * @returns {Promise<CryptoKeyPair>} { publicKey, privateKey }
 */
export async function generateKeyPair() {
  return await crypto.subtle.generateKey(
    { name: 'ECDH', namedCurve: 'P-256' },
    true, // extractable so we can export
    ['deriveKey', 'deriveBits']
  );
}

// ---- Key Export / Import ----

/**
 * Export a public key to JWK format (to send to server)
 */
export async function exportPublicKey(publicKey) {
  return await crypto.subtle.exportKey('jwk', publicKey);
}

/**
 * Export a private key to JWK format (for local encrypted storage)
 */
export async function exportPrivateKey(privateKey) {
  return await crypto.subtle.exportKey('jwk', privateKey);
}

/**
 * Import a public key from JWK format
 */
export async function importPublicKey(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    []
  );
}

/**
 * Import a private key from JWK format
 */
export async function importPrivateKey(jwk) {
  return await crypto.subtle.importKey(
    'jwk',
    jwk,
    { name: 'ECDH', namedCurve: 'P-256' },
    true,
    ['deriveKey', 'deriveBits']
  );
}

// ---- Key Derivation ----

/**
 * Derive an AES-256-GCM shared key from ECDH key agreement
 * Used for encrypting messages between two users
 */
export async function deriveSharedKey(privateKey, publicKey) {
  return await crypto.subtle.deriveKey(
    {
      name: 'ECDH',
      public: publicKey,
    },
    privateKey,
    { name: 'AES-GCM', length: 256 },
    true, // extractable for IndexedDB caching
    ['encrypt', 'decrypt']
  );
}

/**
 * Derive an AES key from a passphrase using PBKDF2
 * Used to wrap/unwrap private keys for secure local storage
 */
export async function deriveKeyFromPassphrase(passphrase, salt) {
  const encoder = new TextEncoder();
  
  // Import passphrase as a key
  const passphraseKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(passphrase),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  // Derive AES key from passphrase
  return await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt,
      iterations: 600000, // OWASP recommendation for PBKDF2
      hash: 'SHA-256',
    },
    passphraseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Generate a random salt for PBKDF2
 */
export function generateSalt() {
  return crypto.getRandomValues(new Uint8Array(32));
}

// ---- Message Encryption / Decryption ----

/**
 * Encrypt a message using AES-256-GCM
 * @param {string} plaintext - The message to encrypt
 * @param {CryptoKey} sharedKey - The derived shared key
 * @returns {Promise<{ciphertext: string, iv: string}>} Base64-encoded ciphertext and IV
 */
export async function encryptMessage(plaintext, sharedKey) {
  const encoder = new TextEncoder();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv },
    sharedKey,
    encoder.encode(plaintext)
  );

  return {
    ciphertext: arrayBufferToBase64(ciphertext),
    iv: arrayBufferToBase64(iv),
  };
}

/**
 * Decrypt a message using AES-256-GCM
 * @param {string} ciphertextB64 - Base64-encoded ciphertext
 * @param {string} ivB64 - Base64-encoded IV
 * @param {CryptoKey} sharedKey - The derived shared key
 * @returns {Promise<string>} Decrypted plaintext
 */
export async function decryptMessage(ciphertextB64, ivB64, sharedKey) {
  const decoder = new TextDecoder();

  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToArrayBuffer(ivB64) },
    sharedKey,
    base64ToArrayBuffer(ciphertextB64)
  );

  return decoder.decode(plaintext);
}

// ---- Private Key Protection ----

/**
 * Wrap (encrypt) a private key with a passphrase-derived key
 * For safe local storage in IndexedDB
 */
export async function wrapPrivateKey(privateKeyJwk, passphrase) {
  const salt = generateSalt();
  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const encoded = new TextEncoder().encode(JSON.stringify(privateKeyJwk));
  const encrypted = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    encoded
  );

  return {
    data: arrayBufferToBase64(encrypted),
    iv: arrayBufferToBase64(iv),
    salt: arrayBufferToBase64(salt),
  };
}

/**
 * Unwrap (decrypt) a private key using the passphrase
 */
export async function unwrapPrivateKey(wrappedKey, passphrase) {
  const salt = base64ToArrayBuffer(wrappedKey.salt);
  const iv = base64ToArrayBuffer(wrappedKey.iv);
  const data = base64ToArrayBuffer(wrappedKey.data);

  const wrappingKey = await deriveKeyFromPassphrase(passphrase, salt);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    wrappingKey,
    data
  );

  const jwk = JSON.parse(new TextDecoder().decode(decrypted));
  return await importPrivateKey(jwk);
}

// ---- Utility Functions ----

function arrayBufferToBase64(buffer) {
  const bytes = buffer instanceof ArrayBuffer ? new Uint8Array(buffer) : buffer;
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate a fingerprint from a public key for verification
 * @returns {Promise<string>} Hex fingerprint (first 32 chars of SHA-256 hash)
 */
export async function getKeyFingerprint(publicKeyJwk) {
  const encoded = new TextEncoder().encode(JSON.stringify(publicKeyJwk));
  const hash = await crypto.subtle.digest('SHA-256', encoded);
  const bytes = new Uint8Array(hash);
  return Array.from(bytes.slice(0, 16))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
    .match(/.{1,4}/g)
    .join(' ');
}

/**
 * Generate a random recovery key (24 chars, grouped for readability)
 * Format: XXXX-XXXX-XXXX-XXXX-XXXX-XXXX
 */
export function generateRecoveryKey() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I/O/0/1 to avoid confusion
  const bytes = crypto.getRandomValues(new Uint8Array(24));
  let key = '';
  for (let i = 0; i < 24; i++) {
    key += chars[bytes[i] % chars.length];
  }
  return key.match(/.{4}/g).join('-');
}

