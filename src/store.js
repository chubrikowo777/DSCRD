'use strict';
/**
 * Хранилище: один JSON-файл, атомарная запись, отложенный сейв.
 * Без нативных зависимостей — чтобы гарантированно ставилось на любом хостинге.
 */
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE = path.join(DATA_DIR, 'store.json');

function emptyDb() {
  return {
    guilds: {},
    levels: {},
    warnings: {},
    starboard: {},
    warns: {},
    meta: { startedAt: Date.now() }
  };
}

let db = emptyDb();
let saveTimer = null;

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load() {
  ensureDir();
  if (fs.existsSync(FILE)) {
    try {
      const raw = JSON.parse(fs.readFileSync(FILE, 'utf8'));
      db = Object.assign(emptyDb(), raw);
    } catch (err) {
      console.error('[store] не смог прочитать store.json, начинаю с пустого:', err.message);
      db = emptyDb();
    }
  }
  return db;
}

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      ensureDir();
      const tmp = `${FILE}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
      fs.renameSync(tmp, FILE);
    } catch (err) {
      console.error('[store] ошибка записи:', err.message);
    }
  }, 400);
}

function defaultSettings() {
  return {
    welcome: { channelId: null, title: 'Добро пожаловать в Берлогу', text: null, color: 0x2ecc71 },
    farewell: { channelId: null, title: 'До встречи', text: null, color: 0xe74c3c },
    leveling: { enabled: true, channelId: null },
    starboard: { channelId: null, emoji: '⭐', threshold: 3 },
    honeypot: { channelIds: [], action: 'ban', alertChannelId: null },
    logs: { mod: null, action: null },
    jail: { roleId: null, channelId: null },
    nsfwFeed: { channels: {}, intervalMin: 45, blacklist: [] },
    antiraid: { enabled: true, joinLimit: 8, joinWindowSec: 30, minAccountAgeDays: 10, lockdown: false },
    automod: { invites: true, links: false, caps: true, mentions: 5, spam: true, attachments: 4 },
    staffRoles: [],
    verify: { channelId: null, memberRoleId: null, nsfwRoleId: null }
  };
}

function settings(guildId) {
  if (!db.guilds[guildId]) {
    db.guilds[guildId] = defaultSettings();
    save();
  }
  // дозаполняем недостающие ключи после обновлений схемы
  const def = defaultSettings();
  const cur = db.guilds[guildId];
  for (const key of Object.keys(def)) {
    if (cur[key] === undefined) cur[key] = def[key];
    else if (def[key] && typeof def[key] === 'object' && !Array.isArray(def[key])) {
      for (const sub of Object.keys(def[key])) {
        if (cur[key][sub] === undefined) cur[key][sub] = def[key][sub];
      }
    }
  }
  return cur;
}

function levelData(guildId, userId) {
  if (!db.levels[guildId]) db.levels[guildId] = {};
  if (!db.levels[guildId][userId]) db.levels[guildId][userId] = { xp: 0, level: 0, messages: 0, lastAt: 0 };
  return db.levels[guildId][userId];
}

function warnData(guildId, userId) {
  if (!db.warnings[guildId]) db.warnings[guildId] = {};
  if (!db.warnings[guildId][userId]) db.warnings[guildId][userId] = [];
  return db.warnings[guildId][userId];
}

function starEntry(guildId) {
  if (!db.starboard[guildId]) db.starboard[guildId] = {};
  return db.starboard[guildId];
}

module.exports = { load, save, settings, levelData, warnData, starEntry, get db() { return db; } };
