'use strict';
/**
 * Модерация: мут в «подвальск», предупреждения, кик, бан.
 * Мут = роль с запретами по всем каналам + разрешение писать в одном канале-подвале.
 */
const { ChannelType, PermissionsBitField } = require('discord.js');
const store = require('./store');
const log = require('./logger');
const { muteEmbed, warnEmbed } = require('./embeds');

const MUTE_ROLE_NAME = '🔇 Заглушенные';
const JAIL_NAME = 'подвальск';

const DENY = [
  PermissionsBitField.Flags.SendMessages,
  PermissionsBitField.Flags.AddReactions,
  PermissionsBitField.Flags.CreatePublicThreads,
  PermissionsBitField.Flags.CreatePrivateThreads,
  PermissionsBitField.Flags.SendMessagesInThreads,
  PermissionsBitField.Flags.Speak
];

async function ensureMuteRole(guild) {
  let role = guild.roles.cache.find((r) => r.name === MUTE_ROLE_NAME);
  if (!role) {
    role = await guild.roles.create({
      name: MUTE_ROLE_NAME,
      colors: { primaryColor: 0x95a5a6 },
      permissions: [],
      reason: 'Роль для мута'
    });
    log.info(`создана роль ${role.name} в ${guild.name}`);
  }
  return role;
}

async function ensureStaffIds(guild) {
  const cfg = store.settings(guild.id);
  if (cfg.staffRoles.length) return cfg.staffRoles;
  const ids = guild.roles.cache
    .filter((r) => /Админ|Модератор|Ведущий/i.test(r.name) && !r.managed)
    .map((r) => r.id);
  cfg.staffRoles = ids;
  store.save();
  return ids;
}

async function ensureJailChannel(guild, role) {
  let ch = guild.channels.cache.find((c) => c.name === JAIL_NAME && c.type === ChannelType.GuildText);
  if (ch) return ch;

  const staff = await ensureStaffIds(guild);
  const overwrites = [
    { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
    {
      id: role.id,
      allow: [
        PermissionsBitField.Flags.ViewChannel,
        PermissionsBitField.Flags.SendMessages,
        PermissionsBitField.Flags.ReadMessageHistory,
        PermissionsBitField.Flags.AddReactions
      ]
    }
  ];
  for (const id of staff) {
    overwrites.push({ id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] });
  }

  ch = await guild.channels.create({
    name: JAIL_NAME,
    type: ChannelType.GuildText,
    topic: 'Сюда попадают замьюченные. Писать здесь можно, в остальных каналах — нет.',
    permissionOverwrites: overwrites,
    reason: 'Канал для замьюченных'
  });
  log.info(`создан канал ${ch.name} в ${guild.name}`);
  return ch;
}

async function applyOverwrites(guild, role, jailId) {
  const targets = guild.channels.cache.filter((c) => c.id !== jailId && c.isTextBased());
  for (const ch of targets.values()) {
    const ow = ch.permissionOverwrites.cache.get(role.id);
    const already = ow && ow.deny.has(PermissionsBitField.Flags.SendMessages);
    if (already) continue;
    await ch.permissionOverwrites
      .edit(role.id, { SendMessages: false, AddReactions: false, CreatePublicThreads: false, SendMessagesInThreads: false }, { reason: 'Мут-роль' })
      .catch((e) => log.debug('overwrite:', ch.name, e.message));
    await new Promise((r) => setTimeout(r, 200));
  }
}

async function mute(guild, member, mod, durationMs, reason) {
  const role = await ensureMuteRole(guild);
  const jail = await ensureJailChannel(guild, role);

  const cfg = store.settings(guild.id);
  if (cfg.jail.roleId !== role.id || cfg.jail.channelId !== jail.id) {
    cfg.jail = { roleId: role.id, channelId: jail.id };
    store.save();
  }

  await applyOverwrites(guild, role, jail.id);
  await member.roles.add(role, reason || 'Мут').catch((e) => log.warn('роль мута:', e.message));

  const untilTs = durationMs ? Math.floor((Date.now() + durationMs) / 1000) : null;
  await jail
    .send({ content: `${member}`, embeds: [muteEmbed(member, mod, reason, untilTs)] })
    .catch((e) => log.warn('подвальск:', e.message));

  if (durationMs) {
    if (durationMs <= 28 * 24 * 60 * 60 * 1000) {
      await member.timeout(durationMs, reason || 'Мут').catch(() => {});
    }
    const timer = setTimeout(() => {
      member.roles.remove(role, 'Срок мута истёк').catch(() => {});
    }, durationMs);
    if (timer.unref) timer.unref();
  }

  return { role, jail, untilTs };
}

async function unmute(guild, member) {
  const cfg = store.settings(guild.id);
  const role = cfg.jail.roleId ? guild.roles.cache.get(cfg.jail.roleId) : guild.roles.cache.find((r) => r.name === MUTE_ROLE_NAME);
  if (role) await member.roles.remove(role, 'Мут снят').catch(() => {});
  await member.timeout(null, 'Мут снят').catch(() => {});
  return role;
}

function addWarn(guild, userId, mod, reason) {
  const list = store.warnData(guild.id, userId);
  list.push({ id: Date.now().toString(36), reason, by: mod.id, at: Date.now() });
  store.save();
  return list.length;
}

function getWarns(guild, userId) {
  return store.warnData(guild.id, userId);
}

module.exports = { mute, unmute, addWarn, getWarns, ensureJailChannel, ensureMuteRole, MUTE_ROLE_NAME, JAIL_NAME };
