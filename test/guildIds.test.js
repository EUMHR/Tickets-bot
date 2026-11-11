const assert = require('node:assert/strict');
const test = require('node:test');
const { getGuildIds, syncCommands } = require('../src/config/guildIds');

const firstGuild = '123456789012345678';
const secondGuild = '234567890123456789';

test('GUILD_ID accepts comma-separated server IDs and removes duplicates', () => {
  assert.deepEqual(getGuildIds(`${firstGuild}, ${secondGuild},${firstGuild}`), [firstGuild, secondGuild]);
});

test('GUILD_ID rejects malformed server IDs', () => {
  assert.throws(() => getGuildIds(`${firstGuild},not-an-id`), /Invalid GUILD_ID/);
});

test('commands are cleared then redeployed in each configured server', async () => {
  const calls = [];
  const client = {
    application: {
      commands: {
        async set(commandData, guildId) {
          calls.push({ commandData, guildId });
        }
      }
    }
  };
  const commands = [{ name: 'points' }, { name: 'reset' }];
  await syncCommands(client, commands, [firstGuild, secondGuild]);
  assert.deepEqual(calls.filter((call) => call.commandData.length === 0)
    .map((call) => call.guildId).sort(), [firstGuild, secondGuild].sort());
  assert.deepEqual(calls.filter((call) => call.commandData.length > 0)
    .map((call) => call.guildId).sort(), [firstGuild, secondGuild].sort());
  for (const guildId of [firstGuild, secondGuild]) {
    const clearIndex = calls.findIndex((call) => call.guildId === guildId && call.commandData.length === 0);
    const deployIndex = calls.findIndex((call) => call.guildId === guildId && call.commandData === commands);
    assert.ok(clearIndex >= 0 && deployIndex > clearIndex);
  }
});

test('global commands are cleared then redeployed when no guilds are configured', async () => {
  const calls = [];
  const client = {
    application: {
      commands: {
        async set(commandData, guildId) {
          calls.push({ commandData, guildId });
        }
      }
    }
  };
  const commands = [{ name: 'points' }];
  await syncCommands(client, commands, []);
  assert.deepEqual(calls, [
    { commandData: [], guildId: undefined },
    { commandData: commands, guildId: undefined }
  ]);
});
