import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const USER_DIR = join(process.env.CACHE_DIR || join(__dirname, '../../cache'), 'users');

function ensureDir() {
  if (!existsSync(USER_DIR)) mkdirSync(USER_DIR, { recursive: true });
}

function userFile(userId) {
  // Sanitize: alphanumeric + hyphens only, max 64 chars
  const safe = String(userId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
  if (!safe) throw new Error('Invalid user ID');
  return join(USER_DIR, `${safe}.json`);
}

export function getUser(userId) {
  ensureDir();
  const f = userFile(userId);
  if (!existsSync(f)) return { portfolio: [], savedSearches: [] };
  try {
    return JSON.parse(readFileSync(f, 'utf-8'));
  } catch {
    return { portfolio: [], savedSearches: [] };
  }
}

export function saveUser(userId, data) {
  ensureDir();
  const f = userFile(userId);
  const safe = {
    portfolio: Array.isArray(data.portfolio) ? data.portfolio.slice(0, 50) : [],
    savedSearches: Array.isArray(data.savedSearches) ? data.savedSearches.slice(0, 20) : [],
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(f, JSON.stringify(safe, null, 2));
  return safe;
}
