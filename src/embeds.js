'use strict';
/**
 * Все embed-ы в одном месте: единый стиль для приветствий, прощаний, уровней, мутов, рейда.
 */
const { EmbedBuilder } = require('discord.js');

const COLORS = {
  welcome: 0x2ecc71,
  farewell: 0xe74c3c,
  level: 0xf1c40f,
  mute: 0x95a5a6,
  raid: 0xff0000,
  warn: 0xe67e22,
  starboard: 0xf1c40f,
  nsfw: 0x9b59b6,
  info: 0x3498db
};

const GREETINGS = [
  'Добро пожаловать в Берлогу!',
  'Наконец-то ты здесь.',
  'Заходи, тут тепло.',
  'Свои люди — заходи.',
  'Ещё одна лапа в берлоге.'
];

function pick(list, seed) {
  const i = Math.abs(Number(seed) || 0) % list.length;
  return list[i];
}

function fmt(n) {
  return new Intl.NumberFormat('ru-RU').format(n || 0);
}

function welcomeEmbed(member, cfg) {
  const createdTs = Math.floor(member.user.createdTimestamp / 1000);
  const e = new EmbedBuilder()
    .setColor(cfg.color || COLORS.welcome)
    .setAuthor({ name: `Новый участник · ${member.user.tag}`, iconURL: member.user.displayAvatarURL({ size: 128 }) })
    .setTitle(cfg.title || pick(GREETINGS, member.user.id.slice(-3)))
    .setDescription(
      cfg.text ||
        `Ты — **${fmt(member.guild.memberCount)}-й** в берлоге.\n` +
          'Первым делом: прочитай правила, поставь реакцию в верификации и зайди в «знакомство».'
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: 'Аккаунт создан', value: `<t:${createdTs}:R>`, inline: true },
      { name: 'Участников', value: fmt(member.guild.memberCount), inline: true }
    )
    .setFooter({ text: member.guild.name })
    .setTimestamp();

  if (member.premiumSince) e.addFields({ name: 'Бустер', value: 'Спасибо за поддержку 💎', inline: true });
  return e;
}

function farewellEmbed(member, cfg) {
  return new EmbedBuilder()
    .setColor(cfg.color || COLORS.farewell)
    .setAuthor({ name: `Ушёл · ${member.user.tag}`, iconURL: member.user.displayAvatarURL({ size: 128 }) })
    .setTitle(cfg.title || 'До встречи')
    .setDescription(
      cfg.text ||
        `**${member.user.username}** покинул сервер.\nТеперь нас **${fmt(member.guild.memberCount)}**.\n\nЕсли обидел кто-то — напиши в «жалобы», вернём.`
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: member.guild.name })
    .setTimestamp();
}

function levelUpEmbed(member, level, xp) {
  return new EmbedBuilder()
    .setColor(COLORS.level)
    .setAuthor({ name: member.user.tag, iconURL: member.user.displayAvatarURL({ size: 128 }) })
    .setTitle(`Новый уровень — ${level}`)
    .setDescription(`${member} поднялся до **уровня ${level}**.\nОпыта всего: **${fmt(xp)}** XP.`)
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setFooter({ text: member.guild.name })
    .setTimestamp();
}

function muteEmbed(member, mod, reason, untilTs) {
  const e = new EmbedBuilder()
    .setColor(COLORS.mute)
    .setTitle('Добро пожаловать в подвальск')
    .setDescription(
      `${member} отправлен в подвал.\n` +
        'Молчать теперь можно только здесь, остальной сервер для тебя закрыт.'
    )
    .addFields(
      { name: 'Причина', value: reason || 'не указана', inline: false },
      { name: 'Кто', value: `${mod}`, inline: true }
    )
    .setThumbnail(member.user.displayAvatarURL({ size: 256 }))
    .setTimestamp();
  if (untilTs) e.addFields({ name: 'До', value: `<t:${untilTs}:R>`, inline: true });
  return e;
}

function warnEmbed(target, mod, reason, count) {
  return new EmbedBuilder()
    .setColor(COLORS.warn)
    .setTitle('Предупреждение')
    .setDescription(`${target} получил предупреждение. Всего активных: **${count}**.\n\n**Причина:** ${reason}`)
    .setFooter({ text: `от ${mod.tag || mod}` })
    .setTimestamp();
}

function raidEmbed(title, description, color) {
  return new EmbedBuilder()
    .setColor(color || COLORS.raid)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();
}

function starboardEmbed(message, count, emoji) {
  const e = new EmbedBuilder()
    .setColor(COLORS.starboard)
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({ size: 128 }) })
    .setDescription(message.content ? message.content.slice(0, 1900) : '_без текста_')
    .addFields({ name: 'Канал', value: `<#${message.channelId}>`, inline: true })
    .setFooter({ text: `${emoji} ${count} · id ${message.id}` })
    .setTimestamp(message.createdAt);

  const img = message.attachments.find((a) => /\.(png|jpe?g|gif|webp)$/i.test(a.url));
  if (img) e.setImage(img.url);
  return e;
}

function nsfwPostEmbed(post, tags) {
  const file = post.file || {};
  const img = file.url && /\.(png|jpe?g|gif|webp)$/i.test(file.url) ? file.url : null;
  const artist = (post.tags && post.tags.artist ? post.tags.artist.join(', ') : 'неизвестно').slice(0, 400);
  const e = new EmbedBuilder()
    .setColor(COLORS.nsfw)
    .setTitle(`e621 · ${tags.slice(0, 150)}`)
    .setURL(`https://e621.net/posts/${post.id}`)
    .addFields(
      { name: 'Художник', value: artist, inline: false },
      { name: 'Рейтинг', value: String(post.rating || '?'), inline: true },
      { name: 'Оценка', value: String(post.score && post.score.total != null ? post.score.total : '?'), inline: true }
    )
    .setFooter({ text: `post ${post.id}` })
    .setTimestamp();
  if (img) e.setImage(img);
  else if (file.url) e.setDescription(`[Открыть файл](${file.url})`);
  return e;
}

module.exports = {
  COLORS,
  welcomeEmbed,
  farewellEmbed,
  levelUpEmbed,
  muteEmbed,
  warnEmbed,
  raidEmbed,
  starboardEmbed,
  nsfwPostEmbed,
  fmt
};
