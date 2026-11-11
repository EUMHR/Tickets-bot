const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const {
  createPendingReview,
  adjustPoints,
  getPoints,
  getReview,
  resetPoints,
  resolveReview
} = require('../src/tickets/pointsStore');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ticket-points-'));
const storePath = path.join(directory, 'points.json');

test.after(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

test('approved tickets award two points exactly once per ticket', () => {
  createPendingReview({
    channelId: 'ticket-1',
    guildId: 'guild-1',
    staffId: 'staff-1'
  }, storePath);

  assert.equal(resolveReview('ticket-1', true, 'manager-1', storePath).status, 'approved');
  assert.equal(resolveReview('ticket-1', true, 'manager-2', storePath).reviewerId, 'manager-1');
  assert.equal(resolveReview('ticket-1', false, 'manager-2', storePath).status, 'approved');
  assert.equal(getPoints('guild-1', 'staff-1', storePath), 2);
});

test('rejected reviews do not award points', () => {
  createPendingReview({
    channelId: 'ticket-2',
    guildId: 'guild-1',
    staffId: 'staff-2'
  }, storePath);

  assert.equal(resolveReview('ticket-2', false, 'manager-1', storePath).status, 'rejected');
  assert.equal(getPoints('guild-1', 'staff-2', storePath), 0);
  assert.equal(getReview('ticket-2', storePath).status, 'rejected');
});

test('manual adjustments add and remove points without allowing negative balances', () => {
  assert.equal(adjustPoints('guild-2', 'staff-3', 'add', 9, storePath), 9);
  assert.equal(adjustPoints('guild-2', 'staff-3', 'remove', 4, storePath), 5);
  assert.throws(() => adjustPoints('guild-2', 'staff-3', 'remove', 6, storePath), /only has 5/);
  assert.equal(getPoints('guild-2', 'staff-3', storePath), 5);
});

test('reset clears only the selected server balances and preserves review records', () => {
  createPendingReview({
    channelId: 'ticket-3',
    guildId: 'guild-reset',
    staffId: 'staff-3'
  }, storePath);
  adjustPoints('guild-reset', 'staff-3', 'add', 5, storePath);
  adjustPoints('guild-keep', 'staff-4', 'add', 7, storePath);

  assert.deepEqual(resetPoints('guild-reset', storePath), { users: 1, points: 5 });
  assert.equal(getPoints('guild-reset', 'staff-3', storePath), 0);
  assert.equal(getPoints('guild-keep', 'staff-4', storePath), 7);
  assert.equal(getReview('ticket-3', storePath).status, 'pending');
});
