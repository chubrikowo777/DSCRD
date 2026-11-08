'use strict';
/**
 * Замок: бот работает только на разрешённых серверах.
 * Любой другой сервер — бот сразу выходит, команды и модерация там не срабатывают.
 *
 * Список берётся из ALLOWED_GUILDS (через запятую), иначе из GUILD_ID,
 * иначе — из вшитого DEFAULT_GUILD. То есть «из коробки» бот заперт на один сервер.
 */
const log = require('./logger');

/** Наш сервер. Меняется только здесь или через переменную окружения. */
const DEFAULT_GUILD = '1568752097111965756';

const raw = [process.env.ALLOWED_GUILDS, process.env.GUILD_ID]
  .filter(Boolean)
  .join(',');

const allowed = new Set(
  (raw || DEFAULT_GUILD)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
);

function isAllowed(guildId) {
  if (!guildId) return false;
  return allowed.has(String(guildId));
}

function warnIfOpen() {
  log.info(`замок: только ${[...allowed].join(', ')}`);
}

/** Выйти из всех лишних серверов при старте. */
async function enforce(client) {
  for (const guild of client.guilds.cache.values()) {
    if (isAllowed(guild.id)) continue;
    log.warn(`посторонний сервер ${guild.name} (${guild.id}) — выхожу`);
    await guild.leave().catch((e) => log.warn('leave:', e.message));
  }
}

/** Мгновенная реакция на приглашение в чужой сервер. */
async function onGuildJoin(guild) {
  if (isAllowed(guild.id)) {
    log.info(`подключён к разрешённому серверу ${guild.name}`);
    return;
  }
  log.warn(`приглашён в ${guild.name} (${guild.id}) — не наш сервер, выхожу`);
  await guild.leave().catch((e) => log.warn('leave:', e.message));
}

module.exports = { isAllowed, enforce, onGuildJoin, warnIfOpen, allowed };
