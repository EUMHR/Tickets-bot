const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const test = require('node:test');
const { autoClaimTicket, claimTicket } = require('../src/tickets/claimTicket');

const ownerId = '123456789012345678';
const staffId = '223456789012345678';
const roleId = '323456789012345678';

function createTicketFixture() {
  const channel = {
    id: '423456789012345678',
    topic: `ticket-owner:${ownerId}|panel:test-panel`,
    messages: { fetch: async () => new Collection() },
    setTopic: async function setTopic(topic) { this.topic = topic; },
    sent: [],
    async send(payload) { this.sent.push(payload); }
  };
  const config = {
    panels: [{ id: 'test-panel', supportRoleId: roleId }]
  };
  const client = { user: { id: '523456789012345678' } };
  const guild = { id: '623456789012345678' };
  const staffMember = {
    roles: { cache: new Collection([[roleId, { id: roleId }]]) },
    permissions: { has: () => false }
  };

  function message(authorId, member = staffMember, authorBot = false) {
    return {
      guild,
      channel,
      client,
      member,
      author: { id: authorId, bot: authorBot, username: 'staff' }
    };
  }

  return { channel, config, message };
}

test('first eligible staff response automatically claims ticket once', async () => {
  const { channel, config, message } = createTicketFixture();

  await autoClaimTicket(message(staffId), config);
  assert.match(channel.topic, new RegExp(`claimed-by:${staffId}`));
  assert.equal(channel.sent.length, 1);
  assert.match(channel.sent[0].content, new RegExp(staffId));

  await autoClaimTicket(message('723456789012345678'), config);
  assert.match(channel.topic, new RegExp(`claimed-by:${staffId}`));
  assert.equal(channel.sent.length, 1);
});

test('ticket opener and non-staff messages do not claim a ticket', async () => {
  const { channel, config, message } = createTicketFixture();
  const nonStaffMember = {
    roles: { cache: new Collection() },
    permissions: { has: () => false }
  };

  await autoClaimTicket(message(ownerId), config);
  await autoClaimTicket(message(staffId, nonStaffMember), config);
  assert.doesNotMatch(channel.topic, /claimed-by:/);
  assert.equal(channel.sent.length, 0);
});

test('staff-role ticket opener cannot claim through the manual button either', async () => {
  const { channel, config } = createTicketFixture();
  const replies = [];
  const interaction = {
    channel,
    client: { user: { id: '523456789012345678' } },
    user: { id: ownerId, username: 'ticket-opener' },
    member: {
      roles: { cache: new Collection([[roleId, { id: roleId }]]) },
      permissions: { has: () => false }
    },
    async reply(payload) { replies.push(payload); }
  };

  await claimTicket(interaction, config);
  assert.match(replies[0].content, /opener cannot claim/i);
  assert.doesNotMatch(channel.topic, /claimed-by:/);
});
