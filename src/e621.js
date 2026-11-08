'use strict';
/**
 * e621: по 24 поста в сутки в каждый привязанный канал (1 в час), с фильтром качества.
 * Каналы и теги по умолчанию уже прописаны — под наш сервер.
 *
 * ВАЖНО: хардкод-запрет на несовершеннолетнее и gore/scat снять нельзя.
 */
const store = require('./store');
const log = require('./logger');
const { nsfwPostEmbed } = require('./embeds');

const HARD_BLOCK = ['-cub', '-young', '-child', '-underage', '-loli', '-shota', '-toddler', '-gore', '-scat', '-snuff'];
const QUALITY = 'score:>40';
const API = 'https://e621.net/posts.json';
const UA = process.env.E621_USER_AGENT || 'BerlogaBot/1.0 (discord bot)';
const INTERVAL_MIN = 60; // 24 в сутки

/** Канал -> теги. Можно переопределить командой /setup feed. */
const CHANNEL_TAGS = {
  '1568765195436949598': { label: 'ванилла (МЖ)', tags: 'anthro female male -gay -lesbian' },
  '1568765199455100960': { label: 'парни', tags: 'anthro male gay' },
  '1568765204194529501': { label: 'девушки', tags: 'anthro female lesbian solo' },
  '1568765208145567814': { label: 'футы', tags: 'feet anthro female intersex' },
  '1568765211714785411': { label: 'фералы', tags: 'feral' }
};

let timer = null;
const lastPost = new Map(); // channelId -> ts (для !e621)

function queryFor(tags) {
  return [tags, QUALITY, ...HARD_BLOCK].join(' ').trim();
}

async function fetchPost(tags) {
  const url = `${API}?tags=${encodeURIComponent(queryFor(tags))}&limit=40`;
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`e621 ${res.status}`);
  const data = await res.json();
  const posts = Array.isArray(data.posts) ? data.posts : [];
  if (!posts.length) return null;
  return posts[Math.floor(Math.random() * posts.length)];
}

function feed(guildId) {
  const cfg = store.settings(guildId);
  if (!cfg.nsfwFeed.channels) cfg.nsfwFeed.channels = {};
  return cfg.nsfwFeed.channels;
}

/** Привязка канала: настройки из /setup важнее встроенной карты. */
function tagsFor(guildId, channelId) {
  const f = feed(guildId);
  if (f[channelId] && f[channelId].tags) return f[channelId].tags;
  if (CHANNEL_TAGS[channelId]) return CHANNEL_TAGS[channelId].tags;
  return null;
}

function labelFor(guildId, channelId) {
  const f = feed(guildId);
  if (f[channelId] && f[channelId].label) return f[channelId].label;
  if (CHANNEL_TAGS[channelId]) return CHANNEL_TAGS[channelId].label;
  return 'канал';
}

async function postOne(channel) {
  const tags = tagsFor(channel.guild.id, channel.id);
  if (!tags) throw new Error('для этого канала теги не заданы');
  if (!channel.nsfw) throw new Error('канал не помечен как NSFW');
  const post = await fetchPost(tags);
  if (!post) throw new Error('ничего не нашлось по тегам');
  await channel.send({ embeds: [nsfwPostEmbed(post, labelFor(channel.guild.id, channel.id))] });
  return post;
}

/** Ручной пост: !e621 или /e621 — канал определяется сам. */
async function manualPost(channel, ignoreCooldown = false) {
  const key = channel.id;
  const now = Date.now();
  if (!ignoreCooldown && now - (lastPost.get(key) || 0) < 60_000) {
    return { ok: false, reason: 'подожди минуту — не чаще раза в минуту' };
  }
  lastPost.set(key, now);
  const post = await postOne(channel);
  return { ok: true, post };
}

function scheduleInit(client) {
  for (const guild of client.guilds.cache.values()) {
    const f = feed(guild.id);
    let idx = 0;
    for (const [channelId, meta] of Object.entries(CHANNEL_TAGS)) {
      const channel = guild.channels.cache.get(channelId);
      if (!channel) continue;
      if (!f[channelId]) f[channelId] = { tags: meta.tags, label: meta.label, nextAt: 0 };
      if (!f[channelId].nextAt) {
        // разводим каналы по времени, чтобы 5 постов не прилетали одновременно
        f[channelId].nextAt = Date.now() + idx * 9 * 60 * 1000;
      }
      idx += 1;
    }
    store.save();
  }
}

async function tick(client) {
  const now = Date.now();
  for (const guild of client.guilds.cache.values()) {
    const f = feed(guild.id);
    for (const [channelId, entry] of Object.entries(f)) {
      if ((entry.nextAt || 0) > now) continue;
      const channel = guild.channels.cache.get(channelId);
      if (!channel || !channel.isTextBased()) continue;
      try {
        if (channel.nsfw) {
          await postOne(channel);
          log.debug(`e621 -> #${channel.name}`);
        }
      } catch (err) {
        log.warn(`e621 #${channel.name}: ${err.message}`);
      }
      entry.nextAt = Date.now() + INTERVAL_MIN * 60 * 1000;
      store.save();
    }
  }
}

function start(client) {
  if (timer) return;
  scheduleInit(client);
  timer = setInterval(() => {
    tick(client).catch((err) => log.error('e621 tick:', err.message));
  }, 60 * 1000);
  log.info(`e621-фид запущен: ${Object.keys(CHANNEL_TAGS).length} каналов, по 1 посту в час (24 в сутки)`);
}

module.exports = { start, manualPost, postOne, tagsFor, CHANNEL_TAGS };
