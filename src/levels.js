'use strict';
/**
 * Уровни + приветствие/прощание с оформлением.
 */
const { EmbedBuilder } = require('discord.js');
const store = require('./store');
const { welcomeEmbed, farewellEmbed, levelUpEmbed, fmt } = require('./embeds');
const log = require('./logger');

const COOLDOWN_MS = 60 * 1000;
const cooldowns = new Map();

function xpNeeded(level) {
  return 5 * level * level + 50 * level + 100;
}

function levelFromXp(totalXp) {
  let level = 0;
  let rest = totalXp;
  while (rest >= xpNeeded(level)) {
    rest -= xpNeeded(level);
    level += 1;
  }
  return { level, rest, need: xpNeeded(level) };
}

async function handle(message) {
  const cfg = store.settings(message.guild.id);
  if (!cfg.leveling.enabled) return;

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  if (now - (cooldowns.get(key) || 0) < COOLDOWN_MS) return;
  cooldowns.set(key, now);

  const data = store.levelData(message.guild.id, message.author.id);
  const before = data.level || 0;
  data.xp += 15 + Math.floor(Math.random() * 11);
  data.messages = (data.messages || 0) + 1;
  data.lastAt = now;

  const calc = levelFromXp(data.xp);
  data.level = calc.level;
  store.save();

  if (calc.level > before) {
    const target = cfg.leveling.channelId ? message.guild.channels.cache.get(cfg.leveling.channelId) : message.channel;
    if (target && target.isTextBased()) {
      await target.send({ embeds: [levelUpEmbed(message.member, calc.level, data.xp)] }).catch((e) => log.warn('levelup:', e.message));
    }
  }
}

async function announceJoin(member) {
  const cfg = store.settings(member.guild.id);
  if (!cfg.welcome.channelId) return;
  const ch = member.guild.channels.cache.get(cfg.welcome.channelId);
  if (!ch || !ch.isTextBased()) return;
  await ch.send({ content: `${member}`, embeds: [welcomeEmbed(member, cfg.welcome)] }).catch((e) => log.warn('welcome:', e.message));
}

async function announceLeave(member) {
  const cfg = store.settings(member.guild.id);
  if (!cfg.farewell.channelId) return;
  const ch = member.guild.channels.cache.get(cfg.farewell.channelId);
  if (!ch || !ch.isTextBased()) return;
  await ch.send({ embeds: [farewellEmbed(member, cfg.farewell)] }).catch((e) => log.warn('farewell:', e.message));
}

function rankEmbed(member) {
  const data = store.levelData(member.guild.id, member.id);
  const calc = levelFromXp(data.xp || 0);
  const filled = Math.max(0, Math.min(12, Math.round((calc.rest / calc.need) * 12)));
  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 128 }) })
    .setTitle(`Уровень ${calc.level}`)
    .setDescription(`\`${'█'.repeat(filled)}${'░'.repeat(12 - filled)}\` ${calc.rest} / ${calc.need} XP`)
    .addFields(
      { name: 'Всего опыта', value: fmt(data.xp || 0), inline: true },
      { name: 'Сообщений', value: fmt(data.messages || 0), inline: true }
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }));
}

function topEmbed(guild, limit = 10) {
  const all = (store.db.levels[guild.id] || {});
  const rows = Object.entries(all)
    .map(([userId, d]) => ({ userId, xp: d.xp || 0, level: d.level || 0 }))
    .sort((a, b) => b.xp - a.xp)
    .slice(0, limit);

  const medals = ['🥇', '🥈', '🥉'];
  const desc = rows
    .map((r, i) => `${medals[i] || `${i + 1}.`} <@${r.userId}> — **${r.level}** ур. · ${fmt(r.xp)} XP`)
    .join('\n');

  return new EmbedBuilder()
    .setColor(0xf1c40f)
    .setTitle('Топ по опыту')
    .setDescription(desc || 'Пока никто не писал.')
    .setFooter({ text: guild.name });
}

module.exports = { handle, announceJoin, announceLeave, rankEmbed, topEmbed, levelFromXp, xpNeeded };
