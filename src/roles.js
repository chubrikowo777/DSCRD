'use strict';
/**
 * Самостоятельные роли: возраст, гендер, цвет ника, украшения.
 * Меню на select-меню, один раз опубликованное в канале «роли».
 *
 * Гейт: у кого стоит возрастная роль 13-15 или 16-17 — тому роль 18+ не выдаётся
 * ни через меню, ни через кнопку в верификации.
 */
const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const store = require('./store');
const log = require('./logger');

const UNDERAGE_KEYS = ['age_13_15', 'age_16_17'];

const GROUPS = [
  {
    id: 'age',
    label: 'Возраст',
    placeholder: 'Сколько тебе лет',
    max: 1,
    roles: [
      { key: 'age_13_15', name: '🟢 13-15', color: 0x2ecc71 },
      { key: 'age_16_17', name: '🟡 16-17', color: 0xf1c40f },
      { key: 'age_18', name: '🔴 18+', color: 0xe74c3c, nsfw: true }
    ]
  },
  {
    id: 'gender',
    label: 'Кто ты',
    placeholder: 'Парень, девушка или иное',
    max: 1,
    roles: [
      { key: 'boy', name: '💙 Парень', color: 0x3498db },
      { key: 'girl', name: '💗 Девушка', color: 0xe91e63 },
      { key: 'enby', name: '💜 Небинар', color: 0x9b59b6 }
    ]
  },
  {
    id: 'color',
    label: 'Цвет ника',
    placeholder: 'Цвет твоего имени',
    max: 1,
    roles: [
      { key: 'c_red', name: '🔴 Красный', color: 0xe74c3c },
      { key: 'c_orange', name: '🟠 Оранжевый', color: 0xe67e22 },
      { key: 'c_green', name: '🟢 Зелёный', color: 0x2ecc71 },
      { key: 'c_blue', name: '🔵 Синий', color: 0x3498db },
      { key: 'c_purple', name: '🟣 Фиолетовый', color: 0x9b59b6 },
      { key: 'c_pink', name: '🩷 Розовый', color: 0xff69b4 }
    ]
  },
  {
    id: 'extra',
    label: 'Украшения',
    placeholder: 'Всякая всячина',
    max: 3,
    roles: [
      { key: 'femboy', name: '🎀 Фембойчик', color: 0xff69b4 },
      { key: 'silly', name: '🤪 Глупи', color: 0xf1c40f },
      { key: 'notify', name: '🔔 Уведомления', colors: { primaryColor: 0x95a5a6 } },
      { key: 'about', name: '📖 О себе', color: 0x9b59b6 },
      { key: 'gamer', name: '🎮 Играю', color: 0x2ecc71 },
      { key: 'artist', name: '🎨 Рисую', color: 0xf1c40f }
    ]
  }
];

function cfgRoles(guildId) {
  const cfg = store.settings(guildId);
  if (!cfg.roles) cfg.roles = { ids: {}, panelMessageId: null, channelId: null };
  if (!cfg.roles.ids) cfg.roles.ids = {};
  return cfg.roles;
}

async function ensureRoles(guild) {
  const cfg = cfgRoles(guild.id);
  const ids = {};
  for (const group of GROUPS) {
    for (const spec of group.roles) {
      let role = guild.roles.cache.find((r) => r.name === spec.name);
      if (!role) {
        role = await guild.roles
          .create({ name: spec.name, colors: { primaryColor: spec.color }, permissions: [], reason: 'Самостоятельные роли' })
          .catch((err) => {
            log.warn(`роль ${spec.name}:`, err.message);
            return null;
          });
      }
      if (role) ids[spec.key] = role.id;
    }
  }
  cfg.ids = ids;
  store.save();
  log.info(`роли: ${Object.keys(ids).length} готово`);
  return ids;
}

function underageRoles(member, ids) {
  return UNDERAGE_KEYS.map((k) => ids[k]).filter((id) => id && member.roles.cache.has(id));
}

function nsfwBlocked(member, ids) {
  return underageRoles(member, ids).length > 0;
}

function buildPanel() {
  const embed = new EmbedBuilder()
    .setColor(0x9b59b6)
    .setTitle('Роли')
    .setDescription(
      [
        'Выбирай себя в меню ниже. Роли сразу появятся на профиле.',
        '',
        '**Возраст** — обязателен для доступа в 🔞. Если стоит 13-15 или 16-17, роль 18+ не выдаётся.',
        '**Цвет ника** — красит твоё имя на сервере.',
        '**Украшения** — до трёх штук, просто для вида.'
      ].join('\n')
    );

  const rows = [];
  for (const group of GROUPS) {
    const menu = new StringSelectMenuBuilder()
      .setCustomId(`roles:${group.id}`)
      .setPlaceholder(group.placeholder)
      .setMinValues(0)
      .setMaxValues(group.max)
      .addOptions(
        group.roles.map((r) => ({
          label: r.name,
          value: r.key,
          description: group.id === 'age' && r.key === 'age_18' ? 'Только для тех, кому правда есть 18' : undefined
        }))
      );
    rows.push(new ActionRowBuilder().addComponents(menu));
  }
  return { embed, rows };
}

async function sendPanel(channel) {
  const { embed, rows } = buildPanel();
  const msg = await channel.send({ embeds: [embed], components: rows });
  const cfg = cfgRoles(channel.guild.id);
  cfg.panelMessageId = msg.id;
  cfg.channelId = channel.id;
  store.save();
  return msg;
}

function roleNameByKey(key) {
  for (const g of GROUPS) {
    const found = g.roles.find((r) => r.key === key);
    if (found) return found.name;
  }
  return key;
}

async function handleSelect(interaction) {
  const groupId = interaction.customId.split(':')[1];
  const group = GROUPS.find((g) => g.id === groupId);
  if (!group) return interaction.reply({ content: 'Неизвестная группа ролей.', ephemeral: true });

  const cfg = cfgRoles(interaction.guild.id);
  const ids = cfg.ids || {};
  const member = interaction.member;
  const picked = interaction.values;

  // гейт на 18+
  if (picked.includes('age_18') && nsfwBlocked(member, ids) && !picked.includes('age_18')) {
    return interaction.reply({ content: '18+ недоступен: сначала сними возрастную роль.', ephemeral: true });
  }
  if (picked.includes('age_18')) {
    const underage = underageRoles(member, ids);
    if (underage.length) {
      for (const id of underage) await member.roles.remove(id).catch(() => {});
    }
  }

  if (group.max === 1) {
    for (const spec of group.roles) {
      const id = ids[spec.key];
      if (!id) continue;
      const has = member.roles.cache.has(id);
      const want = picked.includes(spec.key);
      if (want && !has) await member.roles.add(id).catch(() => {});
      if (!want && has) await member.roles.remove(id).catch(() => {});
    }
  } else {
    for (const spec of group.roles) {
      const id = ids[spec.key];
      if (!id) continue;
      const has = member.roles.cache.has(id);
      const want = picked.includes(spec.key);
      if (want && !has) await member.roles.add(id).catch(() => {});
      if (!want && has) await member.roles.remove(id).catch(() => {});
    }
  }

  // если сняли 18+ возраст — снимаем и NSFW-роль
  const age18Id = ids.age_18;
  if (age18Id && !member.roles.cache.has(age18Id)) {
    const cfgMain = store.settings(interaction.guild.id);
    if (cfgMain.verify.nsfwRoleId && member.roles.cache.has(cfgMain.verify.nsfwRoleId)) {
      await member.roles.remove(cfgMain.verify.nsfwRoleId).catch(() => {});
    }
  }

  const list = picked.length ? picked.map(roleNameByKey).join(', ') : 'ничего';
  return interaction.reply({ content: `Готово: ${list}.`, ephemeral: true });
}

module.exports = { GROUPS, ensureRoles, sendPanel, handleSelect, nsfwBlocked, underageRoles, cfgRoles, buildPanel };
