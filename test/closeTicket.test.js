const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Collection } = require('discord.js');
const test = require('node:test');
const {
  closeTicket,
  getTicketClaimerId
} = require('../src/tickets/transcriptEngine');

const ownerId = '123456789012345678';
const panelId = 'test-panel';
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-close-'));

test.after(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

test('claimer is read from the ticket topic marker', () => {
  assert.equal(getTicketClaimerId(`ticket-owner:${ownerId}|panel:${panelId}|claimed-by:223456789012345678`), '223456789012345678');
  assert.equal(getTicketClaimerId(`ticket-owner:${ownerId}|panel:${panelId}`), null);
});

test('closing a ticket with no claimer deletes it without opening points review', async () => {
  const channel = {
    id: '323456789012345678',
    name: 'ticket-no-claimer',
    topic: `ticket-owner:${ownerId}|panel:${panelId}`,
    guild: { name: 'Test server' },
    messages: { fetch: async () => new Collection() },
    permissionOverwrites: {
      edit: async () => {
        throw new Error('No-claimer ticket should not be locked for review.');
      }
    },
    deleted: false,
    async delete() { this.deleted = true; }
  };
  const replies = [];
  const interaction = {
    channel,
    guildId: '423456789012345678',
    guild: { ownerId: '523456789012345678' },
    user: { id: ownerId },
    member: { roles: { cache: new Collection() } },
    memberPermissions: { has: () => false },
    async deferReply() {},
    async editReply(payload) { replies.push(payload); }
  };
  let transcriptDmSent = false;
  const client = {
    users: {
      async fetch() {
        return { async send(payload) {
          transcriptDmSent = payload.files?.length === 1;
        } };
      }
    }
  };
  const config = {
    panels: [{ id: panelId, supportRoleIds: [] }],
    transcriptSaveDirectory: 'data/transcripts'
  };

  await closeTicket(interaction, client, config, directory);

  assert.equal(channel.deleted, true);
  assert.equal(transcriptDmSent, true);
  assert.match(replies.at(-1).content, /without a claimer/i);
  assert.doesNotMatch(channel.topic, /ticket-closed:1/);
});
