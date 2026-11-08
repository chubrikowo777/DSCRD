'use strict';
require('dotenv').config();
const { Client, GatewayIntentBits, Partials, Events } = require('discord.js');
const store = require('./src/store');
const log = require('./src/logger');
const antiraid = require('./src/antiraid');
const automod = require('./src/automod');
const levels = require('./src/levels');
const starboard = require('./src/starboard');
const honeypot = require('./src/honeypot');
const e621 = require('./src/e621');
const logs = require('./src/logs');
const roles = require('./src/roles');
const bootstrap = require('./src/bootstrap');
const guard = require('./src/guard');
const { registerCommands, handleInteraction, handlePrefix } = require('./src/commands');

if (!process.env.DISCORD_TOKEN) {
  console.error('Нет DISCORD_TOKEN. Скопируй .env.example в .env и вставь токен (или задай переменную в панели bothost).');
  process.exit(1);
}

store.load();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildInvites,
    GatewayIntentBits.GuildIntegrations,
    GatewayIntentBits.GuildWebhooks,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction, Partials.GuildMember, Partials.User]
});

client.once(Events.ClientReady, async () => {
  log.info(`вошёл как ${client.user.tag} (${client.user.id})`);
  guard.warnIfOpen();
  await guard.enforce(client);
  try {
    await registerCommands(client);
  } catch (err) {
    log.error('регистрация команд:', err.message);
  }
  try {
    await bootstrap.run(client);
  } catch (err) {
    log.error('автонастройка:', err.message);
  }
  antiraid.startWatcher(client);
  e621.start(client);
});

client.on(Events.GuildCreate, (guild) => {
  guard.onGuildJoin(guild).catch(() => {});
});

client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.guildId && !guard.isAllowed(interaction.guildId)) return;
  handleInteraction(client, interaction).catch((err) => {
    log.error('interaction:', err);
    const payload = { content: `Ошибка: ${err.message}`, ephemeral: true };
    if (interaction.deferred || interaction.replied) interaction.followUp(payload).catch(() => {});
    else interaction.reply(payload).catch(() => {});
  });
});

client.on(Events.MessageCreate, async (message) => {
  if (!message.guild || message.author.bot) return;
  if (!guard.isAllowed(message.guild.id)) return;
  try {
    if (await handlePrefix(client, message)) return;
    const caught = await honeypot.handle(message);
    if (caught) return;
    await automod.handle(message);
    await levels.handle(message);
    await logs.messageCreate(message);
  } catch (err) {
    log.error('messageCreate:', err);
  }
});

client.on(Events.MessageDelete, async (message) => {
  if (!message.guild || !guard.isAllowed(message.guild.id)) return;
  try {
    await logs.messageDelete(message);
  } catch (err) {
    log.error('messageDelete:', err);
  }
});

client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
  if (!newMsg.guild || !guard.isAllowed(newMsg.guild.id)) return;
  try {
    await logs.messageUpdate(oldMsg, newMsg);
  } catch (err) {
    log.error('messageUpdate:', err);
  }
});

client.on(Events.GuildMemberAdd, async (member) => {
  if (!guard.isAllowed(member.guild.id)) return;
  try {
    const blocked = await antiraid.onMemberAdd(client, member);
    if (blocked) return;
    await levels.announceJoin(member);
    await logs.memberJoin(member);
  } catch (err) {
    log.error('guildMemberAdd:', err);
  }
});

client.on(Events.GuildMemberRemove, async (member) => {
  if (!guard.isAllowed(member.guild.id)) return;
  try {
    await levels.announceLeave(member);
    await logs.memberLeave(member);
  } catch (err) {
    log.error('guildMemberRemove:', err);
  }
});

client.on(Events.MessageReactionAdd, async (reaction, user) => {
  if (reaction.message.guildId && !guard.isAllowed(reaction.message.guildId)) return;
  try {
    await starboard.onReactionAdd(client, reaction, user);
  } catch (err) {
    log.error('reactionAdd:', err);
  }
});

client.on(Events.MessageReactionRemove, async (reaction, user) => {
  if (reaction.message.guildId && !guard.isAllowed(reaction.message.guildId)) return;
  try {
    await starboard.onReactionRemove(client, reaction, user);
  } catch (err) {
    log.error('reactionRemove:', err);
  }
});

process.on('unhandledRejection', (err) => log.error('unhandledRejection:', err));
process.on('uncaughtException', (err) => log.error('uncaughtException:', err));

client.login(process.env.DISCORD_TOKEN);
