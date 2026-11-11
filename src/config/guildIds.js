function getGuildIds(value = process.env.GUILD_ID) {
  const rawIds = String(value || '').split(',').map((guildId) => guildId.trim()).filter(Boolean);
  const invalid = rawIds.find((guildId) => !/^\d{17,20}$/.test(guildId));
  if (invalid) {
    throw new Error(`Invalid GUILD_ID "${invalid}". Provide one or more comma-separated Discord server IDs.`);
  }
  return [...new Set(rawIds)];
}

async function syncCommands(client, commandData, guildIds = getGuildIds()) {
  if (!guildIds.length) {
    await client.application.commands.set([]);
    await client.application.commands.set(commandData);
    console.log(`[BOT] Synced ${commandData.length} slash commands globally.`);
    return;
  }

  const results = await Promise.all(guildIds.map(async (guildId) => {
    try {
      await client.application.commands.set([], guildId);
      await client.application.commands.set(commandData, guildId);
      console.log(`[BOT] Synced ${commandData.length} slash commands to guild ${guildId}.`);
      return { guildId, success: true };
    } catch (error) {
      console.error(`[BOT] Slash-command sync failed for guild ${guildId} (Discord ${error.code || 'unknown'}): ${error.message}`);
      if (String(error.code) === '50001') {
        console.error(`[BOT] Missing Access: verify GUILD_ID ${guildId}, confirm the bot is in that server, and invite it with the applications.commands scope.`);
      }
      return { guildId, success: false, error };
    }
  }));
  if (results.every((result) => result.success)) return;
  const failed = results.filter((result) => !result.success);
  throw new Error(`Slash-command sync failed for ${failed.map((result) => result.guildId).join(', ')}.`);
}

module.exports = { getGuildIds, syncCommands };
