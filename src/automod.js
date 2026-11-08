'use strict';
/**
 * Автомод: инвайты, ссылки, капс, массовые упоминания, спам, вложения.
 * Три нарушения за 10 минут -> таймаут.
 */
const { PermissionsBitField } = require('discord.js');
const store = require('./store');
const log = require('./logger');
const { raidEmbed } = require('./embeds');

const INVITE = /(discord\.(gg|io|me|li)\/|discordapp\.com\/invite\/|discord\.com\/invite\/)[\w-]+/i;
const LINK = /https?:\/\/\S+/i;
const spam = new Map(); // userId -> { last: string, times: [ts] }
const strikes = new Map(); // userId -> [ts]

function capsRatio(text) {
  const letters = text.replace(/[^a-zA-Zа-яА-ЯёЁ]/g, '');
  if (letters.length < 12) return 0;
  const upper = letters.replace(/[^A-ZА-ЯЁ]/g, '').length;
  return upper / letters.length;
}

async function punish(message, reasons) {
  const cfg = store.settings(message.guild.id);
  const member = message.member;
  if (!member) return false;

  await message.delete().catch(() => {});
  await message.channel
    .send({ embeds: [raidEmbed('Сообщение удалено', `${message.author}, причина: ${reasons.join(', ')}.`, 0xe67e22)] })
    .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000))
    .catch(() => {});

  const key = `${message.guild.id}:${message.author.id}`;
  const now = Date.now();
  const list = (strikes.get(key) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  strikes.set(key, list);

  if (list.length >= 3) {
    await member.timeout(10 * 60 * 1000, `Автомод: ${reasons.join(', ')}`).catch(() => {});
    strikes.set(key, []);
    const target = cfg.logs.action || cfg.logs.mod;
    const ch = target ? message.guild.channels.cache.get(target) : null;
    if (ch) ch.send({ embeds: [raidEmbed('Автомод: мут 10 минут', `${message.author} — ${reasons.join(', ')}.`, 0xe67e22)] }).catch(() => {});
  }
  return true;
}

async function handle(message) {
  if (!message.guild || !message.member) return false;
  const cfg = store.settings(message.guild.id);
  const am = cfg.automod;
  if (message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return false;
  if (message.member.permissions.has(PermissionsBitField.Flags.ManageMessages)) return false;

  const content = message.content || '';
  const reasons = [];

  if (am.invites && INVITE.test(content)) reasons.push('приглашение');
  if (am.links && LINK.test(content)) reasons.push('ссылка');
  if (am.caps && capsRatio(content) > 0.7) reasons.push('капс');
  if (am.mentions && (message.mentions.users.size + message.mentions.roles.size) > am.mentions) reasons.push('массовые упоминания');
  if (am.attachments && message.attachments.size > am.attachments) reasons.push('много вложений');

  if (am.spam && content.length > 3) {
    const key = `${message.guild.id}:${message.author.id}`;
    const rec = spam.get(key) || { last: '', times: [] };
    const now = Date.now();
    rec.times = rec.times.filter((t) => now - t < 10000);
    if (rec.last === content && rec.times.length >= 2) reasons.push('флуд');
    rec.last = content;
    rec.times.push(now);
    spam.set(key, rec);
  }

  if (!reasons.length) return false;
  log.debug('automod:', message.author.tag, reasons.join(','));
  return punish(message, reasons);
}

module.exports = { handle };
