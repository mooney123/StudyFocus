const request = require('supertest');
const { app, db } = require('../index');
const { uniqueEmail, uniquePassword, hashPassword, cleanupTestUsers } = require('./testHelpers');

describe('POST /api/auth/signup', () => {
  afterAll(async () => {
    await cleanupTestUsers(db);
  });

  test('creates a new user and returns a token', async () => {
    const email = uniqueEmail('signup');
    const password = uniquePassword();

    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Signup Test', email, password });

    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user).toMatchObject({ name: 'Signup Test', email });
    expect(res.body.user.password).toBeUndefined();
  });

  test('rejects duplicate email', async () => {
    const email = uniqueEmail('dupe');
    const password = uniquePassword();

    await request(app).post('/api/auth/signup').send({ name: 'First', email, password });
    const res = await request(app)
      .post('/api/auth/signup')
      .send({ name: 'Second', email, password });

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/already exists/i);
  });

  // Data-driven: table of invalid payloads mapped to the field that's wrong,
  // exercising the API's input-validation branch without repeating boilerplate.
  test.each([
    ['missing name', { email: uniqueEmail('missing-name'), password: uniquePassword() }],
    ['missing email', { name: 'No Email', password: uniquePassword() }],
    ['missing password', { name: 'No Password', email: uniqueEmail('missing-pw') }],
    ['short password', { name: 'Short Pw', email: uniqueEmail('short-pw'), password: '123' }],
  ])('rejects signup with %s', async (_label, payload) => {
    const res = await request(app).post('/api/auth/signup').send(payload);
    expect(res.status).toBe(400);
    expect(res.body.error).toEqual(expect.any(String));
  });

  test('white-box: password is stored as a SHA-256 hash, never plaintext', async () => {
    const email = uniqueEmail('hash-check');
    const password = uniquePassword();

    await request(app).post('/api/auth/signup').send({ name: 'Hash Check', email, password });

    const result = await db.query('SELECT password FROM users WHERE email = $1', [email]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].password).toBe(hashPassword(password));
    expect(result.rows[0].password).not.toBe(password);
  });
});

describe('POST /api/auth/login', () => {
  let email, password;

  beforeAll(async () => {
    email = uniqueEmail('login');
    password = uniquePassword();
    await request(app).post('/api/auth/signup').send({ name: 'Login Test', email, password });
  });

  afterAll(async () => {
    await cleanupTestUsers(db);
  });

  test('logs in with correct credentials', async () => {
    const res = await request(app).post('/api/auth/login').send({ email, password });
    expect(res.status).toBe(200);
    expect(res.body.token).toEqual(expect.any(String));
    expect(res.body.user.email).toBe(email);
  });

  test.each([
    ['wrong password', () => ({ email, password: 'not-the-password' })],
    ['unknown email', () => ({ email: uniqueEmail('unknown'), password })],
    ['missing password', () => ({ email })],
  ])('rejects login with %s', async (_label, buildPayload) => {
    const res = await request(app).post('/api/auth/login').send(buildPayload());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.body.error).toEqual(expect.any(String));
  });
});

describe('GET /api/auth/verify', () => {
  afterAll(async () => {
    await cleanupTestUsers(db);
  });

  test('returns the authenticated user for a valid token', async () => {
    const email = uniqueEmail('verify');
    const password = uniquePassword();
    const signup = await request(app).post('/api/auth/signup').send({ name: 'Verify Test', email, password });
    const token = signup.body.token;

    const res = await request(app).get('/api/auth/verify').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.valid).toBe(true);
    expect(res.body.user.email).toBe(email);
  });

  test('rejects requests with no token', async () => {
    const res = await request(app).get('/api/auth/verify');
    expect(res.status).toBe(401);
  });

  test('rejects requests with a malformed token', async () => {
    const res = await request(app).get('/api/auth/verify').set('Authorization', 'Bearer not-a-real-token');
    expect(res.status).toBe(401);
  });
});

afterAll(async () => {
  await db.end();
});
