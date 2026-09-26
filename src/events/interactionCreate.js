const { createTicket } = require('../tickets/createTicket');
const path = require('node:path');
const { PermissionFlagsBits } = require('discord.js');
const { closeTicket } = require('../tickets/transcriptEngine');
const { claimTicket } = require('../tickets/claimTicket');
const { buildPanelContainer, v2ContainerPayload } = require('../dashboard/componentsV2');

function registerInteractionHandler(client, commands, config) {
  client.on('interactionCreate', async (interaction) => {
    try {
      if (interaction.isChatInputCommand()) {
        const command = commands.get(interaction.commandName);
        if (command) {
          await command.execute(interaction, client, config);
          return;
        }
        const panel = config.panels.find((item) => item.commandName === interaction.commandName);
        if (panel) {
          if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
            await interaction.reply({ content: 'You need Manage Server permission to post ticket panels.', ephemeral: true });
            return;
          }
          await interaction.deferReply({ ephemeral: true });
          await interaction.channel.send({
            ...v2ContainerPayload(buildPanelContainer(panel, config)),
            allowedMentions: { parse: [] }
          });
          await interaction.editReply({ content: `Panel "${panel.panelTitleText}" posted.` });
        }
        return;
      }

      if (!interaction.isButton()) return;
      if (interaction.customId === 'create_ticket') {
        await createTicket(interaction, client, null, config);
      } else if (interaction.customId.startsWith('open_ticket::')) {
        await interaction.deferReply({ ephemeral: true });
        const panelId = interaction.customId.split('::')[1];
        const panel = config.panels.find((item) => item.id === panelId);
        if (!panel) {
          await interaction.editReply({ content: 'This ticket panel is no longer available.' });
          return;
        }
        await createTicket(interaction, client, panel, config, true);
      } else if (interaction.customId === 'close_ticket') {
        const transcriptDirectory = path.isAbsolute(config.transcriptSaveDirectory)
          ? config.transcriptSaveDirectory
          : path.join(__dirname, '..', '..', config.transcriptSaveDirectory);
        await closeTicket(interaction, client, config, transcriptDirectory);
      } else if (interaction.customId === 'claim_ticket') {
        await claimTicket(interaction, config);
      }
    } catch (error) {
      if (['10062', '40060'].includes(String(error.code))) {
        console.warn('[INTERACTIONS] Discord expired or already acknowledged the interaction:', error.code);
        return;
      }
      console.error('[INTERACTIONS] Handler failed:', error);
      const message = { content: 'Something went wrong while handling that interaction.', ephemeral: true };
      if (interaction.deferred) await interaction.editReply(message).catch(() => {});
      else if (!interaction.replied) await interaction.reply(message).catch(() => {});
    }
  });
}

module.exports = { registerInteractionHandler };
