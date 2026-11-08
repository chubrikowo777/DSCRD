'use strict';
/**
 * Автонастройка при первом запуске: ищет каналы и роли по именам,
 * которые уже есть на сервере «Берлога», и прописывает их в настройки.
 * Дальше всё меняется командами /setup.
 */
const store = require('./store');
const log = require('./logger');
const roles = require('./roles');
const { ChannelType } = require('discord.js');

function pickChannel(guild, needles) {
  for (const needle of needles) {
    const found = guild.channels.cache.find(
      (c) => c.isTextBased() && !c.isVoiceBased() && c.name.toLowerCase().includes(needle)
    );
    if (found) return found;
  }
  return null;
}

function pickRole(guild, needles) {
  for (const needle of needles) {
    const found = guild.roles.cache.find((r) => !r.managed && r.name.toLowerCase().includes(needle));
    if (found) return found;
  }
  return null;
}

async function run(client) {
  for (const guild of client.guilds.cache.values()) {
    const cfg = store.settings(guild.id);
    if (cfg.bootstrapped) continue;

    const done = [];

    if (!cfg.logs.action) {
      const ch = pickChannel(guild, ['логи', 'log']);
      if (ch) {
        cfg.logs.action = ch.id;
        done.push(`логи -> #${ch.name}`);
      }
    }
    if (!cfg.logs.mod) {
      const ch = pickChannel(guild, ['караул', 'жалоб', 'модера']);
      if (ch) {
        cfg.logs.mod = ch.id;
        done.push(`мод-логи -> #${ch.name}`);
      }
    }
    if (!cfg.starboard.channelId) {
      const ch = pickChannel(guild, ['starboard', 'звезд', 'звёзд']);
      if (ch) {
        cfg.starboard.channelId = ch.id;
        done.push(`starboard -> #${ch.name}`);
      }
    }
    if (!cfg.honeypot.channelIds.length) {
      const ch = pickChannel(guild, ['honeypot', 'ловушка']);
      if (ch) {
        cfg.honeypot.channelIds.push(ch.id);
        cfg.honeypot.action = 'ban';
        if (!cfg.honeypot.alertChannelId && cfg.logs.mod) cfg.honeypot.alertChannelId = cfg.logs.mod;
        done.push(`honeypot -> #${ch.name}`);
      }
    }
    if (!cfg.welcome.channelId) {
      const ch = pickChannel(guild, ['знакомств', 'вход', 'welcome']);
      if (ch) {
        cfg.welcome.channelId = ch.id;
        done.push(`приветствие -> #${ch.name}`);
      }
    }
    if (!cfg.farewell.channelId) {
      const ch = pickChannel(guild, ['знакомств', 'вход', 'welcome']);
      if (ch) {
        cfg.farewell.channelId = ch.id;
        done.push(`прощание -> #${ch.name}`);
      }
    }

    if (!cfg.staffRoles.length) {
      const ids = [];
      for (const needle of ['админ', 'модератор', 'ведущий']) {
        const role = pickRole(guild, [needle]);
        if (role) ids.push(role.id);
      }
      if (ids.length) {
        cfg.staffRoles = ids;
        done.push(`персонал: ${ids.length} рол.`);
      }
    }

    if (!cfg.verify.memberRoleId) {
      let role = pickRole(guild, ['участник', 'member']);
      if (!role) {
        role = await guild.roles
          .create({ name: 'Участник', color: 0x99aab5, permissions: [], reason: 'Роль верификации' })
          .catch(() => null);
      }
      if (role) {
        cfg.verify.memberRoleId = role.id;
        done.push(`роль участника -> ${role.name}`);
      }
    }
    if (!cfg.verify.nsfwRoleId) {
      const role = pickRole(guild, ['18+', 'nsfw']);
      if (role) {
        cfg.verify.nsfwRoleId = role.id;
        done.push(`роль 18+ -> ${role.name}`);
      }
    }

    cfg.bootstrapped = true;
    store.save();

    // самостоятельные роли + панель
    try {
      await roles.ensureRoles(guild);
      const rcfg = roles.cfgRoles(guild.id);
      if (!rcfg.channelId) {
        let panelCh = pickChannel(guild, ['роли', 'roles', 'выбор']);
        if (!panelCh) {
          panelCh = await guild.channels
            .create({
              name: '🎭-роли',
              type: ChannelType.GuildText,
              topic: 'Выбери роли: возраст, цвет ника, украшения.',
              reason: 'Панель ролей'
            })
            .catch(() => null);
        }
        if (panelCh) {
          await roles.sendPanel(panelCh);
          done.push(`панель ролей -> #${panelCh.name}`);
        }
      }
    } catch (err) {
      log.warn('роли/панель:', err.message);
    }

    if (done.length) log.info(`автонастройка ${guild.name}: ${done.join(', ')}`);
    else log.info(`автонастройка ${guild.name}: ничего не нашёл, настрой руками через /setup`);
  }
}

module.exports = { run };
