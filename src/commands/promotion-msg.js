const {
  EmbedBuilder,
  PermissionFlagsBits,
  SlashCommandBuilder
} = require('discord.js');

const promotionTiers = [
  ['Moderator', 20],
  ['Senior Moderator', 40],
  ['Administrator', 80],
  ['Senior Administrator', 120],
  ['Manager', 200]
];

module.exports = {
  data: new SlashCommandBuilder()
    .setName('promotion-msg')
    .setDescription('Post the staff promotion point thresholds in this channel.')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild),
  async execute(interaction, client, config) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'The promotion message can only be posted in a server.', ephemeral: true });
    }
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({ content: 'You need Manage Server permission to post the promotion message.', ephemeral: true });
    }

    const color = Number.parseInt(String(config.themeColor || '#c6f36b').replace('#', ''), 16);
    const embed = new EmbedBuilder()
      .setTitle('Staff Promotion System')
      .setDescription('Promotion thresholds are based on approved ticket points. Each approved ticket awards 2 points.')
      .addFields(promotionTiers.map(([rank, points]) => ({
        name: rank,
        value: `${points} points`,
        inline: true
      })))
      .addFields({
        name: 'Check your points',
        value: 'Use `/points` to view your total.',
        inline: false
      });
    if (Number.isFinite(color)) embed.setColor(color);

    await interaction.channel.send({ embeds: [embed] });
    await interaction.reply({
      content: `Promotion system posted in ${interaction.channel}.`,
      ephemeral: true
    });
  }
};
