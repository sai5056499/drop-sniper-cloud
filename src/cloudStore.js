'use strict';

const crypto = require('crypto');
const ALGORITHM = 'aes-256-gcm';

// Global in-memory fallback across warm serverless invocations when UPSTASH_REDIS is not yet configured
global.__DROP_SNIPER_MEM__ = global.__DROP_SNIPER_MEM__ || new Map();

class CloudStore {
  constructor() {
    this.restUrl = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || '';
    this.restToken = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || '';
    const secret = process.env.VAULT_SECRET_KEY || 'drop-sniper-ephemeral-cloud-key-32b';
    this.key = crypto.createHash('sha256').update(String(secret)).digest();
  }

  encrypt(payload) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const plaintext = Buffer.from(JSON.stringify(payload), 'utf8');
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString('base64');
  }

  decrypt(ciphertextB64) {
    if (!ciphertextB64) return null;
    const raw = Buffer.from(ciphertextB64, 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv(ALGORITHM, this.key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8'));
  }

  async setEncrypted(namespace, value) {
    const cipherB64 = this.encrypt(value);
    global.__DROP_SNIPER_MEM__.set(namespace, cipherB64);
    if (this.restUrl && this.restToken) {
      try {
        await fetch(`${this.restUrl}/set/${encodeURIComponent(namespace)}`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.restToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(cipherB64)
        });
      } catch {
        // Fallback to in-memory store
      }
    }
  }

  async getDecrypted(namespace, defaultValue = null) {
    let cipherB64 = null;
    if (this.restUrl && this.restToken) {
      try {
        const res = await fetch(`${this.restUrl}/get/${encodeURIComponent(namespace)}`, {
          headers: { Authorization: `Bearer ${this.restToken}` }
        });
        if (res.ok) {
          const body = await res.json();
          cipherB64 = body.result || null;
        }
      } catch {
        // Fallback to in-memory store
      }
    }
    if (!cipherB64) {
      cipherB64 = global.__DROP_SNIPER_MEM__.get(namespace) || null;
    }
    if (!cipherB64) return defaultValue;
    try {
      return this.decrypt(cipherB64);
    } catch {
      return defaultValue;
    }
  }

  static redactAadhaar(aadhaar) {
    const clean = String(aadhaar || '').replace(/\D/g, '');
    if (clean.length < 4) return 'XXXX-XXXX-XXXX';
    return `XXXX-XXXX-${clean.slice(-4)}`;
  }
}

module.exports = { CloudStore };
