'use strict';
/**
 * Honeypot: специальный канал, куда не должен писать никто.
 * Кто написал (включая вебхуки) — уходит в бан, а персонал получает алерт.
 */
const store = require('./store');
const log = require('./logger');
const { raidEmbed } = require('./embeds');
const { isStaff } = require('./antiraid');

async function handle(message) {
  if (!message.guild) return false;
  const cfg = store.settings(message.guild.id);
  if (!cfg.honeypot.channelIds.includes(message.channelId)) return false;

  if (message.member && isStaff(message.guild, message.member.id)) return false;
  if (message.author && message.author.id === message.client.user.id) return false;

  const who = message.author ? `${message.author.tag} (${message.author.id})` : 'вебхук/неизвестно';
  log.warn(`honeypot: ${message.guild.name} — ${who}`);

  await message.delete().catch(() => {});

  try {
    if (message.webhookId) {
      const hooks = await message.guild.fetchWebhooks();
      const hook = hooks.get(message.webhookId);
      if (hook) await hook.delete('Honeypot').catch(() => {});
    } else if (message.member) {
      if (cfg.honeypot.action === 'kick') {
        await message.member.kick('Honeypot').catch(() => {});
      } else if (cfg.honeypot.action === 'timeout') {
        await message.member.timeout(28 * 24 * 60 * 60 * 1000, 'Honeypot').catch(() => {});
      } else {
        await message.member.ban({ reason: 'Honeypot', deleteMessageSeconds: 3600 }).catch(() => {});
      }
    }
  } catch (err) {
    log.warn('honeypot действие:', err.message);
  }

  const target = cfg.honeypot.alertChannelId || cfg.logs.action || cfg.logs.mod;
  const ch = target ? message.guild.channels.cache.get(target) : null;
  if (ch) {
    const action = cfg.honeypot.action === 'ban' ? 'забанен' : cfg.honeypot.action === 'kick' ? 'кикнут' : 'замьючен на 28 дней';
    await ch
      .send({
        embeds: [
          raidEmbed(
            '🍯 Honeypot сработал',
            `Написал: **${who}** в <#${message.channelId}>\nДействие: ${action}.\nСообщение: \`${(message.content || 'без текста').slice(0, 200)}\``,
            0xff0000
          )
        ]
      })
      .catch(() => {});
  }
  return true;
}

module.exports = { handle };
