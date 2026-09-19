const crypto = require('crypto');

// Prefixing every test-created email lets afterAll() sweep them from the
// shared dev database without touching real user data.
const TEST_EMAIL_PREFIX = 'sdet_test_';

const uniqueEmail = (label = 'user') =>
  `${TEST_EMAIL_PREFIX}${label}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}@example.com`;

const uniquePassword = () => `Passw0rd_${crypto.randomBytes(3).toString('hex')}`;

// Mirrors the server's own hashing (server/index.js) so DB white-box
// assertions can check the stored value without importing server internals.
const hashPassword = (password) =>
  crypto.createHash('sha256').update(password).digest('hex');

const cleanupTestUsers = async (db) => {
  await db.query('DELETE FROM users WHERE email LIKE $1', [`${TEST_EMAIL_PREFIX}%`]);
};

module.exports = { TEST_EMAIL_PREFIX, uniqueEmail, uniquePassword, hashPassword, cleanupTestUsers };
