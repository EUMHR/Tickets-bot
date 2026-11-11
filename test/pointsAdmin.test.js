const assert = require('node:assert/strict');
const { Collection } = require('discord.js');
const test = require('node:test');
const {
  getPointsAdminRoleIds,
  hasPointsAdminRole
} = require('../src/tickets/pointsAdmin');

const adminRoleIds = ['123456789012345678', '234567890123456789'];

test('point admin role IDs are configured by environment and validated', () => {
  assert.deepEqual(getPointsAdminRoleIds(`${adminRoleIds[0]}, ${adminRoleIds[1]},${adminRoleIds[0]}`), adminRoleIds);
  assert.deepEqual(getPointsAdminRoleIds(''), []);
  assert.throws(() => getPointsAdminRoleIds('not-a-role-id'), /Invalid POINTS_ADMIN_ROLE_IDS/);
});

test('all configured point admin roles in any bot server are allowed', async () => {
  for (const roleId of adminRoleIds) {
    const interaction = { user: { id: '123456789012345678' } };
    const client = {
      guilds: {
        cache: new Collection([
          ['guild-one', { members: { cache: new Collection(), fetch: async () => null } }],
          ['guild-two', {
            members: {
              cache: new Collection(),
              fetch: async () => ({
                roles: { cache: new Collection([[roleId, { id: roleId }]]) }
              })
            }
          }]
        ])
      }
    };
    assert.equal(await hasPointsAdminRole(interaction, client, adminRoleIds), true);
  }
});

test('members without an allowed role in any bot server cannot manage points', async () => {
  const member = { roles: { cache: new Collection([['999999999999999999', { id: '999999999999999999' }]]) } };
  const interaction = { user: { id: '123456789012345678' } };
  const client = {
    guilds: {
      cache: new Collection([
        ['guild-one', { members: { cache: new Collection(), fetch: async () => member } }],
        ['guild-two', { members: { cache: new Collection(), fetch: async () => member } }]
      ])
    }
  };
  assert.equal(await hasPointsAdminRole(interaction, client, adminRoleIds), false);
});

test('missing membership in a server is skipped while checking other servers', async () => {
  const allowedRole = adminRoleIds[0];
  const interaction = { user: { id: '123456789012345678' } };
  const client = {
    guilds: {
      cache: new Collection([
        ['guild-one', {
          members: {
            cache: new Collection(),
            fetch: async () => {
              const error = new Error('Unknown member');
              error.code = 10007;
              throw error;
            }
          }
        }],
        ['guild-two', {
          members: {
            cache: new Collection(),
            fetch: async () => ({ roles: { cache: new Collection([[allowedRole, {}]]) } })
          }
        }]
      ])
    }
  };
  assert.equal(await hasPointsAdminRole(interaction, client, adminRoleIds), true);
});
