const fs = require('node:fs');
const crypto = require('node:crypto');

const KEY_LENGTH = 64;
const MIN_PASSWORD_LENGTH = 12;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, KEY_LENGTH).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string') return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !/^[a-f0-9]{128}$/i.test(hash || '')) return false;
  const candidate = crypto.scryptSync(String(password), salt, KEY_LENGTH);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

class UserStore {
  constructor(usersPath) {
    this.usersPath = usersPath;
    this.users = this.load();
  }

  load() {
    if (fs.existsSync(this.usersPath)) {
      try {
        const parsed = JSON.parse(fs.readFileSync(this.usersPath, 'utf8'));
        if (Array.isArray(parsed)) return parsed;
      } catch (error) {
        console.error('[ADMIN] Could not read dashboard users:', error.message);
      }
    }

    const username = process.env.ADMIN_USERNAME;
    const password = process.env.ADMIN_PASSWORD;
    if (username && password) {
      this.users = [{
        username: String(username).trim(),
        passwordHash: hashPassword(password),
        createdAt: new Date().toISOString()
      }];
      this.save();
      return this.users;
    }
    return [];
  }

  save() {
    fs.mkdirSync(require('node:path').dirname(this.usersPath), { recursive: true });
    fs.writeFileSync(this.usersPath, JSON.stringify(this.users, null, 2));
  }

  list() {
    return this.users.map(({ username, createdAt }) => ({ username, createdAt }));
  }

  find(username) {
    const normalized = String(username || '').trim().toLowerCase();
    return this.users.find((user) => user.username.toLowerCase() === normalized);
  }

  verify(username, password) {
    const user = this.find(username);
    return user ? verifyPassword(password, user.passwordHash) : false;
  }

  add(username, password) {
    const normalizedUsername = String(username || '').trim();
    const normalizedPassword = String(password || '');
    if (!/^[a-zA-Z0-9_.-]{2,32}$/.test(normalizedUsername)) {
      throw new Error('Usernames must be 2-32 letters, numbers, dots, dashes, or underscores.');
    }
    if (normalizedPassword.length < MIN_PASSWORD_LENGTH) {
      throw new Error(`Passwords must be at least ${MIN_PASSWORD_LENGTH} characters.`);
    }
    if (this.find(normalizedUsername)) throw new Error(`A user named "${normalizedUsername}" already exists.`);

    this.users.push({
      username: normalizedUsername,
      passwordHash: hashPassword(normalizedPassword),
      createdAt: new Date().toISOString()
    });
    this.save();
  }

  remove(username) {
    const index = this.users.findIndex((user) => user.username.toLowerCase() === String(username).toLowerCase());
    if (index < 0) throw new Error(`No user named "${username}" found.`);
    if (this.users.length <= 1) throw new Error('Cannot delete the last dashboard user.');
    this.users.splice(index, 1);
    this.save();
  }
}

module.exports = { UserStore };
