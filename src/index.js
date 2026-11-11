const { Client, GatewayIntentBits, Partials, PermissionFlagsBits, SlashCommandBuilder } = require('discord.js');
const path = require('node:path');
require('dotenv').config();
const { loadCommands } = require('./handlers/loadCommands');
const { registerInteractionHandler } = require('./events/interactionCreate');
const { configStore } = require('./config/configStore');
const { syncCommands } = require('./config/guildIds');
const { logDirectMessage } = require('./handlers/dmLogger');

function createClient() {
  return new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages],
    partials: [Partials.Channel]
  });
}

function getCommandData(config = configStore.config) {
  const commandData = [...loadCommands().values()].map((command) => command.data.toJSON());
  const registeredNames = new Set(commandData.map((command) => command.name));
  for (const panel of config.panels) {
    if (!panel.commandName || registeredNames.has(panel.commandName)) {
      console.error(`[BOT] Skipping duplicate or empty panel command: ${panel.commandName || '(empty)'}`);
      continue;
    }
    commandData.push(new SlashCommandBuilder()
      .setName(panel.commandName)
      .setDescription(String(panel.commandDescription || `Deploy ${panel.panelTitleText} ticket panel`).slice(0, 100))
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
      .toJSON());
    registeredNames.add(panel.commandName);
  }
  return commandData;
}

async function startBot(client = createClient()) {
  const token = process.env.DISCORD_TOKEN;
  if (!token) throw new Error('DISCORD_TOKEN is required. Add it to your .env file.');

  const commands = loadCommands();
  const { config } = configStore;
  const { autoClaimTicket } = require('./tickets/claimTicket');
  client.once('clientReady', () => {
    console.log(`[BOT] Logged in as ${client.user.tag}`);
  });
  registerInteractionHandler(client, commands, config);
  client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (message.guild) {
      try {
        await autoClaimTicket(message, config);
      } catch (error) {
        console.error('[TICKETS] Could not auto-claim ticket:', error.message);
      }
      return;
    }
    try {
      await logDirectMessage(message, config, path.join(__dirname, '..', 'data', 'dm-logs.json'));
    } catch (error) {
      console.error('[DM LOGGER] Could not store direct message:', error.message);
    }
  });

  await client.login(token);
  if (!client.isReady()) await new Promise((resolve) => client.once('clientReady', resolve));

  const commandData = getCommandData(config);
  try {
    await syncCommands(client, commandData);
  } catch (error) {
    console.error(`[BOT] Slash-command sync failed: ${error.message}`);
  }
  return client;
}

if (require.main === module) {
  startBot().catch((error) => {
    console.error('[BOT] Could not start:', error.message);
    process.exitCode = 1;
  });
}

module.exports = { createClient, getCommandData, startBot };
