const { EmbedBuilder, SlashCommandBuilder } = require('discord.js');
const { getPoints } = require('../tickets/pointsStore');

const promotionTiers = [
  { name: 'Moderator', points: 20 },
  { name: 'Senior Moderator', points: 40 },
  { name: 'Administrator', points: 80 },
  { name: 'Senior Administrator', points: 120 },
  { name: 'Manager', points: 200 }
];

function getProgressBar(points, threshold) {
  const filled = Math.min(10, Math.floor((points / threshold) * 10));
  return `${'█'.repeat(filled)}${'░'.repeat(10 - filled)}`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('points')
    .setDescription('Check a staff member point total.')
    .addUserOption((option) =>
      option.setName('staff')
        .setDescription('Staff member to check; defaults to you.')
    ),
  async execute(interaction, client, config) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'Staff points are only available inside a server.', ephemeral: true });
    }
    const user = interaction.options.getUser('staff') || interaction.user;
    const points = getPoints(interaction.guildId, user.id);
    const currentTier = promotionTiers.slice().reverse().find((tier) => points >= tier.points);
    const nextTier = promotionTiers.find((tier) => points < tier.points);
    const color = Number.parseInt(String(config.themeColor || '#c6f36b').replace('#', ''), 16);
    const embed = new EmbedBuilder()
      .setColor(Number.isFinite(color) ? color : 0xc6f36b)
      .setAuthor({
        name: `${user.globalName || user.username} · Staff Points`,
        iconURL: user.displayAvatarURL()
      })
      .setDescription(`## ${points} ${points === 1 ? 'point' : 'points'}\nEarn 2 points for each approved ticket.`)
      .addFields({
        name: 'Promotion rank',
        value: currentTier ? `**${currentTier.name}**` : 'Not yet eligible',
        inline: true
      });

    if (nextTier) {
      embed.addFields({
        name: `Next · ${nextTier.name}`,
        value: `\`${getProgressBar(points, nextTier.points)}\`  **${points}/${nextTier.points}**`,
        inline: true
      });
    } else {
      embed.addFields({
        name: 'Promotion progress',
        value: 'Top promotion tier reached.',
        inline: true
      });
    }

    embed.setFooter({ text: `Server staff points · ${interaction.guild.name}` });
    await interaction.reply({
      embeds: [embed],
      ephemeral: true,
      allowedMentions: { parse: [] }
    });
  }
};
