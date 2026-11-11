const assert = require('node:assert/strict');
const test = require('node:test');
const { buildTicketPointsEmbed } = require('../src/tickets/transcriptEngine');

test('ticket points audit embed includes opener, staff, balance, award and transcript', () => {
  const embed = buildTicketPointsEmbed({
    status: 'approved',
    channelName: 'ticket-example',
    channelId: '123456789012345678',
    ticketOwnerId: '223456789012345678',
    staffId: '323456789012345678',
    points: 2,
    transcriptId: 'abc123',
    reviewerId: '423456789012345678',
    reviewedAt: '2026-10-30T12:00:00.000Z'
  }, 18, 'https://tickets.example.com/transcripts/guild-1/abc123');

  const data = embed.toJSON();
  assert.equal(data.title, 'Ticket #ticket-example');
  assert.equal(data.color, 0x57f287);
  assert.deepEqual(data.fields.map((field) => [field.name, field.value]), [
    ['Ticket Opener', '<@223456789012345678>'],
    ['Support Member', '<@323456789012345678>'],
    ['Points Now', '18'],
    ['Points Added', '+2'],
    ['Transcript', '[Open transcript](https://tickets.example.com/transcripts/guild-1/abc123)'],
    ['Ticket ID', '123456789012345678'],
    ['Reviewed By', '<@423456789012345678>']
  ]);
});

test('rejected ticket points audit indicates zero awarded', () => {
  const embed = buildTicketPointsEmbed({
    status: 'rejected',
    channelName: 'ticket-example',
    channelId: '123456789012345678',
    ticketOwnerId: '223456789012345678',
    staffId: '323456789012345678',
    points: 2,
    transcriptId: 'abc123',
    reviewerId: '423456789012345678',
    reviewedAt: '2026-10-30T12:00:00.000Z'
  }, 16, null);

  const fields = embed.toJSON().fields;
  assert.equal(fields.find((field) => field.name === 'Points Now').value, '16');
  assert.equal(fields.find((field) => field.name === 'Points Added').value, '0');
  assert.equal(fields.find((field) => field.name === 'Transcript').value, 'Saved as `abc123.html`');
});
