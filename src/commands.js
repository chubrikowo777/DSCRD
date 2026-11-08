'use strict';
/**
 * Слэш-команды: определения + обработчик.
 * Регистрация идёт в guild, чтобы команды появились сразу, а не через час.
 */
const {
  SlashCommandBuilder,
  EmbedBuilder,
  PermissionFlagsBits,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle
} = require('discord.js');
const store = require('./store');
const log = require('./logger');
const md = require('./moderation');
const levels = require('./levels');
const antiraid = require('./antiraid');
const logs = require('./logs');
const roles = require('./roles');
const e621 = require('./e621');
const { fmt, COLORS } = require('./embeds');

function parseDuration(input) {
  if (!input) return null;
  const m = /^(\d+)\s*([smhd])$/i.exec(String(input).trim());
  if (!m) return null;
  const n = Number(m[1]);
  const unit = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[m[2].toLowerCase()];
  return n * unit;
}

const commands = [
  new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Настройка сервера')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand((s) =>
      s
        .setName('welcome')
        .setDescription('Приветствие')
        .addChannelOption((o) => o.setName('channel').setDescription('Куда').setRequired(true))
        .addStringOption((o) => o.setName('text').setDescription('Текст (можно {user}, {count})'))
        .addStringOption((o) => o.setName('title').setDescription('Заголовок'))
    )
    .addSubcommand((s) =>
      s
        .setName('farewell')
        .setDescription('Прощание')
        .addChannelOption((o) => o.setName('channel').setDescription('Куда').setRequired(true))
        .addStringOption((o) => o.setName('text').setDescription('Текст'))
        .addStringOption((o) => o.setName('title').setDescription('Заголовок'))
    )
    .addSubcommand((s) =>
      s
        .setName('levels')
        .setDescription('Уровни')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Вкл/выкл').setRequired(true))
        .addChannelOption((o) => o.setName('channel').setDescription('Куда писать о повышении'))
    )
    .addSubcommand((s) =>
      s
        .setName('starboard')
        .setDescription('Витрина лучших сообщений')
        .addChannelOption((o) => o.setName('channel').setDescription('Канал-витрина').setRequired(true))
        .addIntegerOption((o) => o.setName('threshold').setDescription('Сколько реакций нужно').setMinValue(1))
        .addStringOption((o) => o.setName('emoji').setDescription('Эмодзи (по умолчанию ⭐)'))
    )
    .addSubcommand((s) =>
      s
        .setName('honeypot')
        .setDescription('Канал-ловушка')
        .addChannelOption((o) => o.setName('channel').setDescription('Канал').setRequired(true))
        .addStringOption((o) =>
          o
            .setName('action')
            .setDescription('Что делать')
            .addChoices({ name: 'бан', value: 'ban' }, { name: 'кик', value: 'kick' }, { name: 'мут 28 дней', value: 'timeout' })
        )
        .addChannelOption((o) => o.setName('alert').setDescription('Куда слать алерт'))
    )
    .addSubcommand((s) =>
      s
        .setName('logs')
        .setDescription('Логи')
        .addChannelOption((o) => o.setName('action').setDescription('Действия: сообщения, входы'))
        .addChannelOption((o) => o.setName('mod').setDescription('Модерация'))
    )
    .addSubcommand((s) =>
      s
        .setName('feed')
        .setDescription('e621 в NSFW-канал')
        .addChannelOption((o) => o.setName('channel').setDescription('NSFW-канал').setRequired(true))
        .addStringOption((o) => o.setName('tags').setDescription('Теги e621 через пробел').setRequired(true))
        .addIntegerOption((o) => o.setName('interval').setDescription('Минут между постами').setMinValue(5))
    )
    .addSubcommand((s) =>
      s
        .setName('feed-remove')
        .setDescription('Убрать e621 из канала')
        .addChannelOption((o) => o.setName('channel').setDescription('Канал').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('antiraid')
        .setDescription('Анти-рейд')
        .addBooleanOption((o) => o.setName('enabled').setDescription('Вкл/выкл').setRequired(true))
        .addIntegerOption((o) => o.setName('limit').setDescription('Сколько входов за окно = рейд').setMinValue(2))
        .addIntegerOption((o) => o.setName('window').setDescription('Окно в секундах').setMinValue(5))
        .addIntegerOption((o) => o.setName('minage').setDescription('Мин. возраст аккаунта, дней').setMinValue(0))
    )
    .addSubcommand((s) =>
      s
        .setName('staff')
        .setDescription('Роли персонала (кому можно шуметь)')
        .addRoleOption((o) => o.setName('role').setDescription('Роль').setRequired(true))
    )
    .addSubcommand((s) =>
      s
        .setName('automod')
        .setDescription('Правила автомода')
        .addStringOption((o) =>
          o
            .setName('rule')
            .setDescription('Какое правило')
            .addChoices(
              { name: 'инвайты', value: 'invites' },
              { name: 'ссылки', value: 'links' },
              { name: 'капс', value: 'caps' },
              { name: 'флуд', value: 'spam' }
            )
        )
        .addBooleanOption((o) => o.setName('enabled').setDescription('Вкл/выкл правило'))
        .addIntegerOption((o) => o.setName('mentions').setDescription('Максимум упоминаний в сообщении').setMinValue(1))
        .addIntegerOption((o) => o.setName('attachments').setDescription('Максимум вложений').setMinValue(1))
    )
    .addSubcommand((s) =>
      s
        .setName('verify')
        .setDescription('Опубликовать панель верификации')
        .addRoleOption((o) => o.setName('member_role').setDescription('Роль для «Участник»').setRequired(true))
        .addRoleOption((o) => o.setName('nsfw_role').setDescription('Роль для «18+»'))
    ),

  new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Отправить в подвальск')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Кого').setRequired(true))
    .addStringOption((o) => o.setName('duration').setDescription('Срок: 10m, 2h, 7d (пусто = навсегда)'))
    .addStringOption((o) => o.setName('reason').setDescription('Причина')),

  new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Снять мут')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Кого').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Предупреждение')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Кому').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('За что').setRequired(true)),

  new SlashCommandBuilder()
    .setName('warnings')
    .setDescription('Предупреждения участника')
    .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers)
    .addUserOption((o) => o.setName('user').setDescription('Кто').setRequired(true)),

  new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Кикнуть')
    .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers)
    .addUserOption((o) => o.setName('user').setDescription('Кого').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина')),

  new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Забанить')
    .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
    .addUserOption((o) => o.setName('user').setDescription('Кого').setRequired(true))
    .addStringOption((o) => o.setName('reason').setDescription('Причина')),

  new SlashCommandBuilder()
    .setName('clear')
    .setDescription('Удалить сообщения')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addIntegerOption((o) => o.setName('count').setDescription('Сколько (1-100)').setMinValue(1).setMaxValue(100).setRequired(true)),

  new SlashCommandBuilder()
    .setName('rank')
    .setDescription('Уровень и опыт')
    .addUserOption((o) => o.setName('user').setDescription('Кого показать')),

  new SlashCommandBuilder().setName('top').setDescription('Топ по опыту'),

  new SlashCommandBuilder()
    .setName('panic')
    .setDescription('Локдаун сервера')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((o) =>
      o.setName('state').setDescription('Вкл или выкл').setRequired(true).addChoices({ name: 'включить', value: 'on' }, { name: 'выключить', value: 'off' })
    ),

  new SlashCommandBuilder()
    .setName('roles')
    .setDescription('Опубликовать меню ролей (возраст, цвет, украшения)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),

  new SlashCommandBuilder().setName('e621').setDescription('Один пост e621 в этот канал (теги по каналу)'),

  new SlashCommandBuilder().setName('help').setDescription('Что умеет бот')
];

async function registerCommands(client) {
  const body = commands.map((c) => c.toJSON());
  const guildId = process.env.GUILD_ID;
  if (guildId) {
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      await guild.commands.set(body);
      log.info(`команды зарегистрированы в ${guild.name}`);
      return;
    }
  }
  for (const guild of client.guilds.cache.values()) {
    await guild.commands.set(body).catch((e) => log.warn('register:', guild.name, e.message));
  }
  log.info(`команды зарегистрированы в ${client.guilds.cache.size} серверах`);
}

function ok(interaction, text) {
  return interaction.reply({ content: text, ephemeral: true });
}

async function handleInteraction(client, interaction) {
  if (interaction.isButton()) {
    return handleButton(interaction);
  }
  if (interaction.isStringSelectMenu() && interaction.customId.startsWith('roles:')) {
    return roles.handleSelect(interaction);
  }
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  const guild = interaction.guild;
  if (!guild) return ok(interaction, 'Только на сервере.');

  if (commandName === 'setup') {
    const sub = interaction.options.getSubcommand();
    const cfg = store.settings(guild.id);

    if (sub === 'welcome' || sub === 'farewell') {
      const ch = interaction.options.getChannel('channel');
      const text = interaction.options.getString('text');
      const title = interaction.options.getString('title');
      cfg[sub].channelId = ch.id;
      if (text) cfg[sub].text = text;
      if (title) cfg[sub].title = title;
      store.save();
      return ok(interaction, `Готово: ${sub} -> <#${ch.id}>`);
    }

    if (sub === 'levels') {
      cfg.leveling.enabled = interaction.options.getBoolean('enabled');
      const ch = interaction.options.getChannel('channel');
      if (ch) cfg.leveling.channelId = ch.id;
      store.save();
      return ok(interaction, `Уровни: ${cfg.leveling.enabled ? 'вкл' : 'выкл'}${cfg.leveling.channelId ? `, анонсы в <#${cfg.leveling.channelId}>` : ''}`);
    }

    if (sub === 'starboard') {
      const ch = interaction.options.getChannel('channel');
      cfg.starboard.channelId = ch.id;
      const th = interaction.options.getInteger('threshold');
      if (th) cfg.starboard.threshold = th;
      const em = interaction.options.getString('emoji');
      if (em) cfg.starboard.emoji = em;
      store.save();
      return ok(interaction, `Starboard: <#${ch.id}>, порог ${cfg.starboard.threshold}, эмодзи ${cfg.starboard.emoji}`);
    }

    if (sub === 'honeypot') {
      const ch = interaction.options.getChannel('channel');
      const action = interaction.options.getString('action') || 'ban';
      const alertCh = interaction.options.getChannel('alert');
      if (!cfg.honeypot.channelIds.includes(ch.id)) cfg.honeypot.channelIds.push(ch.id);
      cfg.honeypot.action = action;
      if (alertCh) cfg.honeypot.alertChannelId = alertCh.id;
      store.save();
      return ok(interaction, `Ханипот: <#${ch.id}>, действие: ${action}`);
    }

    if (sub === 'logs') {
      const action = interaction.options.getChannel('action');
      const mod = interaction.options.getChannel('mod');
      if (action) cfg.logs.action = action.id;
      if (mod) cfg.logs.mod = mod.id;
      store.save();
      return ok(interaction, `Логи: действия ${cfg.logs.action ? `<#${cfg.logs.action}>` : '—'}, мод ${cfg.logs.mod ? `<#${cfg.logs.mod}>` : '—'}`);
    }

    if (sub === 'feed') {
      const ch = interaction.options.getChannel('channel');
      const tags = interaction.options.getString('tags');
      const interval = interaction.options.getInteger('interval');
      if (!ch.nsfw) return ok(interaction, 'Канал должен быть помечен как NSFW (18+).');
      cfg.nsfwFeed.channels[ch.id] = { tags, nextAt: 0 };
      if (interval) cfg.nsfwFeed.intervalMin = interval;
      store.save();
      return ok(interaction, `e621: <#${ch.id}> по тегам \`${tags}\`, раз в ${cfg.nsfwFeed.intervalMin} мин.`);
    }

    if (sub === 'feed-remove') {
      const ch = interaction.options.getChannel('channel');
      delete cfg.nsfwFeed.channels[ch.id];
      store.save();
      return ok(interaction, `e621 отключён для <#${ch.id}>.`);
    }

    if (sub === 'antiraid') {
      cfg.antiraid.enabled = interaction.options.getBoolean('enabled');
      const limit = interaction.options.getInteger('limit');
      const win = interaction.options.getInteger('window');
      const minage = interaction.options.getInteger('minage');
      if (limit) cfg.antiraid.joinLimit = limit;
      if (win) cfg.antiraid.joinWindowSec = win;
      if (minage !== null && minage !== undefined) cfg.antiraid.minAccountAgeDays = minage;
      store.save();
      return ok(
        interaction,
        `Анти-рейд: ${cfg.antiraid.enabled ? 'вкл' : 'выкл'}, ${cfg.antiraid.joinLimit} входов / ${cfg.antiraid.joinWindowSec} с, мин. возраст ${cfg.antiraid.minAccountAgeDays} дн.`
      );
    }

    if (sub === 'staff') {
      const role = interaction.options.getRole('role');
      if (!cfg.staffRoles.includes(role.id)) cfg.staffRoles.push(role.id);
      store.save();
      return ok(interaction, `Роль ${role.name} теперь считается персоналом.`);
    }

    if (sub === 'automod') {
      const rule = interaction.options.getString('rule');
      const enabled = interaction.options.getBoolean('enabled');
      const mentions = interaction.options.getInteger('mentions');
      const attachments = interaction.options.getInteger('attachments');
      if (rule && enabled !== null && enabled !== undefined) cfg.automod[rule] = enabled;
      if (mentions) cfg.automod.mentions = mentions;
      if (attachments) cfg.automod.attachments = attachments;
      store.save();
      const state = Object.entries(cfg.automod)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      return ok(interaction, `Автомод: ${state}`);
    }

    if (sub === 'verify') {
      const memberRole = interaction.options.getRole('member_role');
      const nsfwRole = interaction.options.getRole('nsfw_role');
      cfg.verify.memberRoleId = memberRole.id;
      if (nsfwRole) cfg.verify.nsfwRoleId = nsfwRole.id;
      cfg.verify.channelId = interaction.channelId;
      store.save();

      const embed = new EmbedBuilder()
        .setColor(COLORS.info)
        .setTitle('Вход')
        .setDescription(
          '**1.** Прочитай правила выше.\n' +
            `**2.** Нажми «Участник» — получишь роль <@&${memberRole.id}>.\n` +
            (nsfwRole ? `**3.** Нажми «18+» — доступ в раздел 🔞, только если тебе правда 18+.\n` : '') +
            '**4.** Зайди в «знакомство» и напиши пару строк.'
        );

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('verify_member').setLabel('Участник').setStyle(ButtonStyle.Success).setEmoji('✅')
      );
      if (nsfwRole) {
        row.addComponents(new ButtonBuilder().setCustomId('verify_nsfw').setLabel('18+').setStyle(ButtonStyle.Danger).setEmoji('🔞'));
      }

      await interaction.channel.send({ embeds: [embed], components: [row] });
      return ok(interaction, 'Панель верификации опубликована.');
    }
  }

  if (commandName === 'mute') {
    const user = interaction.options.getUser('user');
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return ok(interaction, 'Не нашёл участника.');
    const durRaw = interaction.options.getString('duration');
    const duration = durRaw ? parseDuration(durRaw) : null;
    if (durRaw && !duration) return ok(interaction, 'Срок не понял. Формат: 10m, 2h, 7d.');
    const reason = interaction.options.getString('reason') || 'не указана';

    await interaction.deferReply({ ephemeral: true });
    const res = await md.mute(guild, member, interaction.user, duration, reason);
    await logs.modAction(
      guild,
      new EmbedBuilder()
        .setColor(COLORS.mute)
        .setTitle('Мут')
        .setDescription(`${user.tag} -> <#${res.jail.id}>\nПричина: ${reason}${duration ? `\nСрок: ${durRaw}` : '\nСрок: бессрочно'}`)
        .setTimestamp()
    );
    return interaction.editReply(`Готово: ${user.tag} в подвальске${duration ? ` на ${durRaw}` : ' бессрочно'}.`);
  }

  if (commandName === 'unmute') {
    const user = interaction.options.getUser('user');
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return ok(interaction, 'Не нашёл участника.');
    await md.unmute(guild, member);
    return ok(interaction, `${user.tag} выпущен из подвальска.`);
  }

  if (commandName === 'warn') {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');
    const count = md.addWarn(guild, user.id, interaction.user, reason);
    await logs.modAction(
      guild,
      new EmbedBuilder().setColor(COLORS.warn).setTitle('Предупреждение').setDescription(`${user.tag}\nПричина: ${reason}\nВсего: ${count}`).setTimestamp()
    );
    return ok(interaction, `Предупреждение выдано. Всего у ${user.tag}: ${count}.`);
  }

  if (commandName === 'warnings') {
    const user = interaction.options.getUser('user');
    const list = md.getWarns(guild, user.id);
    if (!list.length) return ok(interaction, `У ${user.tag} предупреждений нет.`);
    const text = list
      .map((w, i) => `${i + 1}. ${w.reason} — <t:${Math.floor(w.at / 1000)}:d>, <@${w.by}>`)
      .join('\n')
      .slice(0, 1800);
    return ok(interaction, `**${user.tag}: ${list.length}**\n${text}`);
  }

  if (commandName === 'kick' || commandName === 'ban') {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'не указана';
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return ok(interaction, 'Не нашёл участника.');
    await interaction.deferReply({ ephemeral: true });
    if (commandName === 'kick') await member.kick(reason).catch((e) => log.warn('kick:', e.message));
    else await member.ban({ reason, deleteMessageSeconds: 3600 }).catch((e) => log.warn('ban:', e.message));
    await logs.modAction(guild, new EmbedBuilder().setColor(COLORS.raid).setTitle(commandName === 'kick' ? 'Кик' : 'Бан').setDescription(`${user.tag}\nПричина: ${reason}`).setTimestamp());
    return interaction.editReply(`${commandName === 'kick' ? 'Кикнут' : 'Забанен'}: ${user.tag}.`);
  }

  if (commandName === 'clear') {
    const count = interaction.options.getInteger('count');
    await interaction.deferReply({ ephemeral: true });
    const deleted = await interaction.channel.bulkDelete(count, true).catch(() => null);
    return interaction.editReply(`Удалено: ${deleted ? deleted.size : 0}.`);
  }

  if (commandName === 'rank') {
    const user = interaction.options.getUser('user') || interaction.user;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member) return ok(interaction, 'Не нашёл участника.');
    return interaction.reply({ embeds: [levels.rankEmbed(member)] });
  }

  if (commandName === 'top') {
    return interaction.reply({ embeds: [levels.topEmbed(guild)] });
  }

  if (commandName === 'panic') {
    const state = interaction.options.getString('state') === 'on';
    await interaction.deferReply({ ephemeral: true });
    await antiraid.panic(guild, state);
    return interaction.editReply(state ? 'Локдаун включён.' : 'Локдаун снят.');
  }

  if (commandName === 'roles') {
    await interaction.deferReply({ ephemeral: true });
    await roles.ensureRoles(guild);
    await roles.sendPanel(interaction.channel);
    return interaction.editReply('Меню ролей опубликовано.');
  }

  if (commandName === 'e621') {
    await interaction.deferReply({ ephemeral: true });
    try {
      const res = await e621.manualPost(interaction.channel);
      if (!res.ok) return interaction.editReply(res.reason);
      return interaction.editReply(`Готово: пост ${res.post.id}.`);
    } catch (err) {
      return interaction.editReply(`Не вышло: ${err.message}`);
    }
  }

  if (commandName === 'help') {
    const e = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('Что умеет бот')
      .setDescription(
        [
          '**Оформление:** приветствие, прощание, повышение уровня (embed-ы).',
          '**Модерация:** /mute → подвальск, /unmute, /warn, /warnings, /kick, /ban, /clear.',
          '**Анти-рейд:** лимит входов, молодые аккаунты, боты, вебхуки, интеграции, /panic.',
          '**Автомод:** инвайты, капс, флуд, массовые упоминания, много вложений.',
          '**Фичи:** starboard, honeypot, e621-фид в NSFW, /rank и /top.',
'**Роли:** /roles — меню возраста, цвета ника и украшений; у 13-15 и 16-17 нет доступа к 18+.',
          '**e621:** \!e621\ или /e621 — один пост в текущий канал по его тегам; автофид 24 в сутки.',
          '**Настройка:** /setup …'
        ].join('\n')
      );
    return interaction.reply({ embeds: [e], ephemeral: true });
  }
}

async function handleButton(interaction) {
  const cfg = store.settings(interaction.guild.id);
  const member = interaction.member;

  if (interaction.customId === 'verify_member') {
    if (!cfg.verify.memberRoleId) return ok(interaction, 'Роль не настроена, позови админа.');
    await member.roles.add(cfg.verify.memberRoleId).catch(() => {});
    return ok(interaction, 'Готово, ты участник.');
  }

  if (interaction.customId === 'verify_nsfw') {
    if (!cfg.verify.nsfwRoleId) return ok(interaction, 'Роль 18+ не настроена.');
    const rcfg = roles.cfgRoles(interaction.guild.id);
    if (roles.nsfwBlocked(member, rcfg.ids || {})) {
      return ok(interaction, '18+ недоступен: у тебя возрастная роль 13-15 или 16-17. Сними её в меню ролей и вернись.');
    }
    if (member.roles.cache.has(cfg.verify.nsfwRoleId)) {
      await member.roles.remove(cfg.verify.nsfwRoleId).catch(() => {});
      return ok(interaction, 'Роль 18+ снята.');
    }
    await member.roles.add(cfg.verify.nsfwRoleId).catch(() => {});
    return ok(interaction, 'Доступ в 🔞 выдан. Врать про возраст не надо.');
  }
}

/**
 * Текстовые команды (!e621 и прочее) — работают без слэша.
 */
async function handlePrefix(client, message) {
  const content = (message.content || '').trim();
  if (!content.startsWith('!')) return false;
  const [rawCmd, ...args] = content.slice(1).split(/\s+/);
  const cmd = rawCmd.toLowerCase();

  if (cmd === 'e621') {
    try {
      const res = await e621.manualPost(message.channel);
      if (res.ok) await message.react('✅').catch(() => {});
      else await message.reply(res.reason).catch(() => {});
    } catch (err) {
      await message.reply(`Не вышло: ${err.message}`).catch(() => {});
    }
    return true;
  }

  if (cmd === 'help' || cmd === 'хелп') {
    const e = new EmbedBuilder()
      .setColor(COLORS.info)
      .setTitle('Команды без слэша')
      .setDescription(['`!e621` — один пост e621 в текущий канал (теги зависят от канала)', '`!help` — эта шпаргалка', '', 'Всё остальное — слэш-командами: /setup, /mute, /roles, /rank и другие.'].join('\n'));
    await message.reply({ embeds: [e] }).catch(() => {});
    return true;
  }

  return false;
}

module.exports = { commands, registerCommands, handleInteraction, handlePrefix, parseDuration };
