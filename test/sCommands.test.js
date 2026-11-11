const assert = require('node:assert/strict');
const { PermissionFlagsBits } = require('discord.js');
const test = require('node:test');
const command = require('../src/commands/s-commands');

test('s-commands posts the rank-specific AdvancedBan embed in the invoking channel', async () => {
  let posted;
  const channel = {
    id: '123456789012345678',
    name: 'staff-guide',
    async send(payload) { posted = payload; }
  };
  const replies = [];
  const interaction = {
    channel,
    memberPermissions: { has: (permission) => permission === PermissionFlagsBits.ManageGuild },
    inGuild: () => true,
    async reply(payload) { replies.push(payload); }
  };

  await command.execute(interaction, null, { themeColor: '#c6f36b' });

  assert.equal(posted.embeds.length, 1);
  const embed = posted.embeds[0].toJSON();
  assert.equal(embed.title, 'AdvancedBan Command Guide');
  const content = embed.description;
  assert.deepEqual([...content.matchAll(/^\*\*# (.+):\*\*$/gm)].map((match) => match[1]), [
    'HELPER',
    'MOD',
    'SRMOD',
    'ADMIN',
    'SRADMIN',
    'MANAGER'
  ]);
  assert.match(content, /^\*\*# HELPER:\*\*\n- `\/advancedban` - Information about the plugin/m);
  assert.match(content, /^\*\*# MOD:\*\*\n- `\/mute` - Mute a user permanently/m);
  assert.match(content, /^\*\*# SRMOD:\*\*\n- `\/tempipban` - Ban a user temporarily by IP/m);
  assert.match(content, /^\*\*# ADMIN:\*\*\n- `\/ban` - Ban a user permanently/m);
  assert.match(content, /^\*\*# SRADMIN:\*\*\n- `\/unpunish` - Delete a punishment by ID/m);
  assert.match(content, /^\*\*# MANAGER:\*\*\n- `\/systemprefs` - Display system preferences for setting up the plugin$/m);
  assert.ok(content.length <= 4096, 'guide must fit Discord embed description limit');
  assert.ok(content.includes('- `/check` - Get all information about a user'), 'commands use Markdown bullet list syntax');
  assert.equal(replies[0].ephemeral, true);
  assert.match(replies[0].content, new RegExp(`<#${channel.id}>`));
});

test('s-commands rejects users without Manage Server', async () => {
  let sentMessage = false;
  let reply;
  const interaction = {
    channel: { async send() { sentMessage = true; } },
    memberPermissions: { has: () => false },
    inGuild: () => true,
    async reply(payload) { reply = payload; }
  };

  await command.execute(interaction, null, {});

  assert.equal(sentMessage, false);
  assert.equal(reply.ephemeral, true);
  assert.match(reply.content, /Manage Server/);
});
