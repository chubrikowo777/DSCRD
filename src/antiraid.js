'use strict';
/**
 * Анти-рейд:
 *  1) частые заходы -> локдаун (верификация + алерт);
 *  2) молодые аккаунты -> кик на входе;
 *  3) боты не из белого списка -> кик;
 *  4) аудит-лог: вебхуки, добавление ботов, интеграции -> откат/алерт.
 */
const { AuditLogEvent, PermissionsBitField } = require('discord.js');
const store = require('./store');
const { raidEmbed } = require('./embeds');
const log = require('./logger');

const joins = new Map();
const lastAuditCheck = new Map();
const ALLOWED_BOTS = new Set(String(process.env.ALLOWED_BOTS || '').split(',').map((s) => s.trim()).filter(Boolean));

function isStaff(guild, userId) {
  if (!userId) return false;
  if (guild.ownerId === userId) return true;
  const member = guild.members.cache.get(userId);
  if (!member) return true; // не смогли проверить — не рискуем банить
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  const cfg = store.settings(guild.id);
  return member.roles.cache.some((r) => cfg.staffRoles.includes(r.id));
}

async function alert(guild, title, text, color) {
  const cfg = store.settings(guild.id);
  const channelId = cfg.honeypot.alertChannelId || cfg.logs.mod || cfg.logs.action;
  const ch = channelId ? guild.channels.cache.get(channelId) : null;
  if (ch && ch.isTextBased()) {
    await ch.send({ embeds: [raidEmbed(title, text, color)] }).catch(() => {});
  }
  log.warn(`[antiraid] ${guild.name}: ${title} — ${text}`);
}

async function lockdown(guild, reason) {
  const cfg = store.settings(guild.id);
  if (cfg.antiraid.lockdown) return;
  cfg.antiraid.lockdown = true;
  store.save();
  try {
    await guild.setVerificationLevel(4, reason);
  } catch (err) {
    log.warn('не смог поднять уровень верификации:', err.message);
  }
  await alert(
    guild,
    '🔒 Локдаун: похоже на рейд',
    `${reason}\n\nВключил максимальную верификацию. Когда всё утихнет: \`/panic off\`.`,
    0xff0000
  );
}

async function onMemberAdd(client, member) {
  const guild = member.guild;
  const cfg = store.settings(guild.id);
  if (!cfg.antiraid.enabled) return false;

  // 1. боты
  if (member.user.bot) {
    const entry = await findRecentAudit(guild, AuditLogEvent.BotAdd, 60 * 1000).catch(() => null);
    const executorId = entry ? entry.executorId : null;
    if (ALLOWED_BOTS.has(member.id)) return false;
    if (executorId && isStaff(guild, executorId)) return false;
    await member.kick('Бот добавлен не персоналом').catch(() => {});
    await alert(guild, '🤖 Добавлен бот', `Бота ${member.user.tag} добавил <@${executorId || '?'}> — кикнул.`, 0xff0000);
    return true;
  }

  // 2. возраст аккаунта
  const ageDays = (Date.now() - member.user.createdTimestamp) / 86400000;
  if (ageDays < cfg.antiraid.minAccountAgeDays) {
    await member
      .send(`Аккаунт слишком новый для «${guild.name}». Зайди позже или напиши администрации.`)
      .catch(() => {});
    await member.kick(`Аккаунт младше ${cfg.antiraid.minAccountAgeDays} дн.`).catch(() => {});
    await alert(guild, '🚪 Молодой аккаунт', `${member.user.tag} (${ageDays.toFixed(1)} дн.) — кикнут на входе.`, 0xe67e22);
    return true;
  }

  // 3. частота заходов
  const now = Date.now();
  const windowMs = cfg.antiraid.joinWindowSec * 1000;
  const list = (joins.get(guild.id) || []).filter((t) => now - t < windowMs);
  list.push(now);
  joins.set(guild.id, list);

  if (list.length >= cfg.antiraid.joinLimit) {
    await lockdown(guild, `За ${cfg.antiraid.joinWindowSec} с зашло ${list.length} человек.`);
  }
  return false;
}

async function findRecentAudit(guild, type, windowMs) {
  const res = await guild.fetchAuditLogs({ type, limit: 5 });
  const now = Date.now();
  const entry = res.entries.find((e) => now - e.createdTimestamp < windowMs);
  return entry || null;
}

async function undoWebhook(guild, entry) {
  if (isStaff(guild, entry.executorId)) return;
  try {
    const hooks = await guild.fetchWebhooks();
    const hook = hooks.get(entry.targetId);
    if (hook) {
      await hook.delete('Вебхук создан не персоналом');
      await alert(guild, '🪝 Вебхук удалён', `Создал <@${entry.executorId}> — вебхук \`${hook.name}\` снесён.`, 0xff0000);
    }
  } catch (err) {
    log.warn('webhook undo:', err.message);
  }
}

async function undoBot(guild, entry) {
  if (isStaff(guild, entry.executorId)) return;
  try {
    const target = await guild.members.fetch(entry.targetId).catch(() => null);
    if (target && target.user.bot) {
      await target.kick('Бот добавлен не персоналом');
      await alert(guild, '🤖 Бот удалён', `Бота ${target.user.tag} добавил <@${entry.executorId}> — кикнут.`, 0xff0000);
    }
  } catch (err) {
    log.warn('bot undo:', err.message);
  }
}

async function startWatcher(client) {
  setInterval(async () => {
    for (const guild of client.guilds.cache.values()) {
      const cfg = store.settings(guild.id);
      if (!cfg.antiraid.enabled) continue;
      const since = lastAuditCheck.get(guild.id) || 0;
      lastAuditCheck.set(guild.id, Date.now());
      try {
        const hooks = await guild.fetchAuditLogs({ type: AuditLogEvent.WebhookCreate, limit: 3 });
        for (const e of hooks.entries.values()) {
          if (e.createdTimestamp > since) await undoWebhook(guild, e);
        }
      } catch (err) {
        log.debug('audit webhook:', err.message);
      }
      try {
        const bots = await guild.fetchAuditLogs({ type: AuditLogEvent.BotAdd, limit: 3 });
        for (const e of bots.entries.values()) {
          if (e.createdTimestamp > since) await undoBot(guild, e);
        }
      } catch (err) {
        log.debug('audit bot:', err.message);
      }
      try {
        const integ = await guild.fetchAuditLogs({ type: AuditLogEvent.IntegrationCreate, limit: 3 });
        for (const e of integ.entries.values()) {
          if (e.createdTimestamp > since && !isStaff(guild, e.executorId)) {
            await alert(
              guild,
              '🔌 Новая интеграция',
              `Интеграцию \`${e.target ? e.target.name || e.target.id : '?'}\` подключил <@${e.executorId}>. Удалять интеграции через API нельзя — проверь вручную.`,
              0xe67e22
            );
          }
        }
      } catch (err) {
        log.debug('audit integration:', err.message);
      }
    }
  }, 20000);
}

async function panic(guild, enable) {
  const cfg = store.settings(guild.id);
  cfg.antiraid.lockdown = !!enable;
  store.save();
  await guild.setVerificationLevel(enable ? 4 : 1).catch(() => {});
  await alert(
    guild,
    enable ? '🔒 Ручной локдаун' : '🔓 Локдаун снят',
    enable ? 'Верификация максимальная. Новые аккаунты не пройдут.' : 'Всё вернулось в обычный режим.'
  );
}

module.exports = { onMemberAdd, lockdown, startWatcher, panic, isStaff };
