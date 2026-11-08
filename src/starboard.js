'use strict';
/**
 * Starboard: сообщение с N реакциями уезжает в канал-витрину,
 * счёт обновляется, при падении ниже порога пост удаляется.
 */
const store = require('./store');
const log = require('./logger');
const { starboardEmbed } = require('./embeds');

function normalize(emoji) {
  return (emoji || '').replace(/\uFE0F/g, '');
}

async function resolveMessage(reaction) {
  if (reaction.partial) {
    try {
      await reaction.fetch();
    } catch {
      return null;
    }
  }
  const message = reaction.message;
  if (!message || !message.guild) return null;
  if (message.partial) {
    try {
      await message.fetch();
    } catch {
      return null;
    }
  }
  return message;
}

async function sync(client, message, reaction) {
  const cfg = store.settings(message.guild.id);
  const sb = cfg.starboard;
  if (!sb.channelId) return;
  if (message.channelId === sb.channelId) return;
  if (!message.author || message.author.bot) return;

  const starChannel = message.guild.channels.cache.get(sb.channelId);
  if (!starChannel || !starChannel.isTextBased()) return;

  const count = reaction.count || 0;
  const entries = store.starEntry(message.guild.id);
  const existingId = entries[message.id];

  if (count >= sb.threshold) {
    const payload = { embeds: [starboardEmbed(message, count, sb.emoji)] };
    if (existingId) {
      const posted = await starChannel.messages.fetch(existingId).catch(() => null);
      if (posted) {
        await posted.edit(payload).catch((e) => log.warn('starboard edit:', e.message));
        return;
      }
    }
    const sent = await starChannel.send(payload).catch((e) => {
      log.warn('starboard send:', e.message);
      return null;
    });
    if (sent) {
      entries[message.id] = sent.id;
      store.save();
    }
    return;
  }

  if (existingId && count < sb.threshold) {
    const posted = await starChannel.messages.fetch(existingId).catch(() => null);
    if (posted) await posted.delete().catch(() => {});
    delete entries[message.id];
    store.save();
  }
}

async function onReactionAdd(client, reaction, user) {
  if (user.bot) return;
  const message = await resolveMessage(reaction);
  if (!message) return;
  const cfg = store.settings(message.guild.id);
  if (normalize(reaction.emoji.name) !== normalize(cfg.starboard.emoji)) return;
  await sync(client, message, reaction);
}

async function onReactionRemove(client, reaction, user) {
  if (user.bot) return;
  const message = await resolveMessage(reaction);
  if (!message) return;
  const cfg = store.settings(message.guild.id);
  if (normalize(reaction.emoji.name) !== normalize(cfg.starboard.emoji)) return;
  await sync(client, message, reaction);
}

module.exports = { onReactionAdd, onReactionRemove };
