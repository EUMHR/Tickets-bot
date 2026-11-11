function getPointsAdminRoleIds(value = process.env.POINTS_ADMIN_ROLE_IDS) {
  const roleIds = String(value || '').split(',').map((roleId) => roleId.trim()).filter(Boolean);
  const invalid = roleIds.find((roleId) => !/^\d{17,20}$/.test(roleId));
  if (invalid) {
    throw new Error(`Invalid POINTS_ADMIN_ROLE_IDS value "${invalid}". Provide comma-separated Discord role IDs.`);
  }
  return [...new Set(roleIds)];
}

async function hasPointsAdminRole(interaction, client, roleIds = getPointsAdminRoleIds()) {
  if (!roleIds.length) return false;
  for (const guild of client.guilds.cache.values()) {
    const member = guild.members.cache.get(interaction.user.id)
      || await guild.members.fetch(interaction.user.id).catch((error) => {
        if (String(error.code) === '10007') return null;
        throw error;
      });
    if (member && roleIds.some((roleId) => member.roles.cache.has(roleId))) return true;
  }
  return false;
}

async function sendPointsAdminAudit(client, config, content) {
  if (!config.pointsLogChannelId) {
    throw new Error('Points log channel is not configured in dashboard settings.');
  }
  const channel = await client.channels.fetch(config.pointsLogChannelId);
  if (!channel?.isTextBased() || !channel.send) {
    throw new Error('Configured points log channel is unavailable or is not a text channel.');
  }
  await channel.send({ content, allowedMentions: { parse: [] } });
}

module.exports = {
  getPointsAdminRoleIds,
  hasPointsAdminRole,
  sendPointsAdminAudit
};
