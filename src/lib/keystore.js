/**
 * CipherChat — Client-side Key Storage (IndexedDB)
 * 
 * Stores wrapped (encrypted) private keys and cached public keys
 * in the browser's IndexedDB. Private keys are never stored in plaintext.
 */

const DB_NAME = 'cipherchat-keys';
const DB_VERSION = 2;
const STORES = {
  PRIVATE_KEYS: 'privateKeys',
  PUBLIC_KEYS: 'publicKeys',
  SESSION_KEYS: 'sessionKeys',
  STICKERS: 'stickers',
};

/**
 * Open the IndexedDB database
 */
function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      reject(new Error('IndexedDB is not available on the server'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORES.PRIVATE_KEYS)) {
        db.createObjectStore(STORES.PRIVATE_KEYS, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(STORES.PUBLIC_KEYS)) {
        db.createObjectStore(STORES.PUBLIC_KEYS, { keyPath: 'userId' });
      }
      if (!db.objectStoreNames.contains(STORES.SESSION_KEYS)) {
        db.createObjectStore(STORES.SESSION_KEYS, { keyPath: 'conversationId' });
      }
      if (!db.objectStoreNames.contains(STORES.STICKERS)) {
        db.createObjectStore(STORES.STICKERS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Generic get/put helpers
 */
async function dbGet(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function dbPut(storeName, data) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.put(data);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbDelete(storeName, key) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.delete(key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function dbClear(storeName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    const request = store.clear();
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// ---- Private Key Storage ----

/**
 * Store a wrapped (encrypted) private key
 * @param {string} userId 
 * @param {object} wrappedKey - { data, iv, salt } from crypto.wrapPrivateKey
 */
export async function storeWrappedPrivateKey(userId, wrappedKey) {
  await dbPut(STORES.PRIVATE_KEYS, { userId, ...wrappedKey });
}

/**
 * Retrieve a wrapped private key
 */
export async function getWrappedPrivateKey(userId) {
  return await dbGet(STORES.PRIVATE_KEYS, userId);
}

/**
 * Delete a wrapped private key
 */
export async function deleteWrappedPrivateKey(userId) {
  await dbDelete(STORES.PRIVATE_KEYS, userId);
}

// ---- Public Key Cache ----

/**
 * Cache a contact's public key (JWK format)
 */
export async function cachePublicKey(userId, publicKeyJwk) {
  await dbPut(STORES.PUBLIC_KEYS, { userId, publicKey: publicKeyJwk, cachedAt: Date.now() });
}

/**
 * Get a cached public key
 */
export async function getCachedPublicKey(userId) {
  const result = await dbGet(STORES.PUBLIC_KEYS, userId);
  return result ? result.publicKey : null;
}

// ---- Session Key Cache ----

/**
 * Cache a derived session key for a conversation
 * Note: CryptoKey objects can't be directly stored in IndexedDB,
 * so we store the raw bits and re-import when needed
 */
export async function cacheSessionKey(conversationId, sharedKey) {
  // Export the key to raw format for storage
  const rawKey = await crypto.subtle.exportKey('raw', sharedKey);
  const keyData = Array.from(new Uint8Array(rawKey));
  await dbPut(STORES.SESSION_KEYS, { conversationId, keyData, cachedAt: Date.now() });
}

/**
 * Get a cached session key
 * @returns {Promise<CryptoKey|null>}
 */
export async function getCachedSessionKey(conversationId) {
  const result = await dbGet(STORES.SESSION_KEYS, conversationId);
  if (!result) return null;

  // Re-import the raw key
  const rawKey = new Uint8Array(result.keyData).buffer;
  return await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Clear a session key
 */
export async function clearSessionKey(conversationId) {
  await dbDelete(STORES.SESSION_KEYS, conversationId);
}

// ---- Cleanup ----

/**
 * Clear all stored keys (for logout)
 */
export async function clearAllKeys() {
  await dbClear(STORES.PRIVATE_KEYS);
  await dbClear(STORES.PUBLIC_KEYS);
  await dbClear(STORES.SESSION_KEYS);
}

// ---- Sticker Storage ----

/**
 * Save a custom sticker
 * @param {string} id - Unique sticker ID
 * @param {string} imageData - Base64 data URL of the sticker image
 * @param {string} name - Sticker name
 */
export async function saveSticker(id, imageData, name = '') {
  await dbPut(STORES.STICKERS, { id, imageData, name, createdAt: Date.now() });
}

/**
 * Get all saved stickers
 */
export async function getStickers() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.STICKERS, 'readonly');
    const store = tx.objectStore(STORES.STICKERS);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Delete a sticker
 */
export async function deleteSticker(id) {
  await dbDelete(STORES.STICKERS, id);
}
