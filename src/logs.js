'use strict';
/**
 * Логи: удаления/правки сообщений, входы/выходы, действия модерации.
 */
const { EmbedBuilder } = require('discord.js');
const store = require('./store');
const log = require('./logger');

const contentCache = new Map(); // messageId -> content

function channel(guild, id) {
  if (!id) return null;
  const ch = guild.channels.cache.get(id);
  return ch && ch.isTextBased() ? ch : null;
}

async function send(guild, id, embed) {
  const ch = channel(guild, id);
  if (!ch) return;
  await ch.send({ embeds: [embed] }).catch(() => {});
}

async function messageCreate(message) {
  if (!message.content) return;
  contentCache.set(message.id, message.content);
  if (contentCache.size > 2000) {
    const first = contentCache.keys().next().value;
    contentCache.delete(first);
  }
}

async function messageDelete(message) {
  if (!message.guild) return;
  const cfg = store.settings(message.guild.id);
  if (!cfg.logs.action) return;
  const content = message.content || contentCache.get(message.id) || '';
  contentCache.delete(message.id);
  if (!content && !message.attachments?.size) return;

  const e = new EmbedBuilder()
    .setColor(0xe74c3c)
    .setTitle('Сообщение удалено')
    .setDescription(content ? content.slice(0, 1800) : '_без текста_')
    .addFields(
      { name: 'Автор', value: message.author ? `${message.author.tag}` : 'неизвестно', inline: true },
      { name: 'Канал', value: `<#${message.channelId}>`, inline: true }
    )
    .setTimestamp();
  await send(message.guild, cfg.logs.action, e);
}

async function messageUpdate(oldMsg, newMsg) {
  if (!newMsg.guild) return;
  if (!newMsg.content || oldMsg.content === newMsg.content) return;
  const cfg = store.settings(newMsg.guild.id);
  contentCache.set(newMsg.id, newMsg.content);
  if (!cfg.logs.action) return;

  const e = new EmbedBuilder()
    .setColor(0x3498db)
    .setTitle('Сообщение изменено')
    .addFields(
      { name: 'Было', value: (oldMsg.content || '—').slice(0, 900) },
      { name: 'Стало', value: (newMsg.content || '—').slice(0, 900) },
      { name: 'Автор', value: newMsg.author ? newMsg.author.tag : 'неизвестно', inline: true },
      { name: 'Канал', value: `<#${newMsg.channelId}>`, inline: true }
    )
    .setTimestamp();
  await send(newMsg.guild, cfg.logs.action, e);
}

async function memberJoin(member) {
  const cfg = store.settings(member.guild.id);
  if (!cfg.logs.action) return;
  const e = new EmbedBuilder()
    .setColor(0x2ecc71)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
    .setTitle('Участник зашёл')
    .addFields(
      { name: 'Аккаунт создан', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
      { name: 'Всего', value: String(member.guild.memberCount), inline: true }
    )
    .setTimestamp();
  await send(member.guild, cfg.logs.action, e);
}

async function memberLeave(member) {
  const cfg = store.settings(member.guild.id);
  if (!cfg.logs.action) return;
  const e = new EmbedBuilder()
    .setColor(0xe67e22)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 64 }) })
    .setTitle('Участник вышел')
    .addFields({ name: 'Всего', value: String(member.guild.memberCount), inline: true })
    .setTimestamp();
  await send(member.guild, cfg.logs.action, e);
}

async function modAction(guild, embed) {
  const cfg = store.settings(guild.id);
  await send(guild, cfg.logs.mod || cfg.logs.action, embed);
}

module.exports = { messageCreate, messageDelete, messageUpdate, memberJoin, memberLeave, modAction };
