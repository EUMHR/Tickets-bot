const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { UserStore } = require('../src/handlers/userStore');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'dashboard-users-'));
const usersPath = path.join(directory, 'users.json');

test.after(() => {
  fs.rmSync(directory, { recursive: true, force: true });
});

test('dashboard passwords accept one character and arbitrary symbols', () => {
  const users = new UserStore(usersPath);
  users.add('admin', '!');
  users.add('symbols', 'a ^#? 😀');

  assert.equal(users.verify('admin', '!'), true);
  assert.equal(users.verify('symbols', 'a ^#? 😀'), true);
  assert.equal(users.verify('admin', 'x'), false);
});

test('dashboard passwords cannot be empty', () => {
  const users = new UserStore(usersPath);
  assert.throws(() => users.add('empty', ''), /cannot be empty/);
});
