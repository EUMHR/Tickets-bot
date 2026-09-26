const { SlashCommandBuilder } = require('discord.js');
const path = require('node:path');
const { closeTicket } = require('../tickets/transcriptEngine');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('close-ticket')
    .setDescription('Close your current ticket after a short delay.'),
  execute(interaction, client, config) {
    const transcriptDirectory = path.isAbsolute(config.transcriptSaveDirectory)
      ? config.transcriptSaveDirectory
      : path.join(__dirname, '..', '..', config.transcriptSaveDirectory);
    return closeTicket(interaction, client, config, transcriptDirectory);
  }
};
