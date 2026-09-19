const request = require('supertest');
const { app, db } = require('../index');
const { uniqueEmail, uniquePassword, cleanupTestUsers } = require('./testHelpers');

// Covers the generic /api/:tab route, which persists to either a JSON file
// (e.g. schedule-planner) or PostgreSQL (settings) depending on the tab name.
describe('/api/:tab generic data endpoint', () => {
  let token;

  beforeAll(async () => {
    const email = uniqueEmail('tabdata');
    const password = uniquePassword();
    const signup = await request(app).post('/api/auth/signup').send({ name: 'Tab Data Test', email, password });
    token = signup.body.token;
  });

  afterAll(async () => {
    await cleanupTestUsers(db);
  });

  test('GET returns defaults for a tab with no saved data yet', async () => {
    const res = await request(app)
      .get('/api/schedule-planner')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ title: 'Schedule Planner' });
  });

  test('PUT then GET round-trips arbitrary JSON for a file-backed tab', async () => {
    const payload = { title: 'My Schedule', generatedSchedule: { monday: ['Math', 'Physics'] } };

    const putRes = await request(app)
      .put('/api/schedule-planner')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(putRes.status).toBe(200);
    expect(putRes.body.success).toBe(true);

    const getRes = await request(app)
      .get('/api/schedule-planner')
      .set('Authorization', `Bearer ${token}`)
      .send();
    expect(getRes.status).toBe(200);
    expect(getRes.body).toEqual(payload);
  });

  // Data-driven: same round-trip assertion, applied to several distinct
  // JSON shapes to prove the endpoint doesn't assume a fixed schema.
  test.each([
    ['empty object', {}],
    ['nested arrays', { items: [1, 2, 3], meta: { tags: ['a', 'b'] } }],
    ['unicode content', { note: 'Café ☕️ 测试' }],
  ])('PUT/GET round-trips %s', async (_label, payload) => {
    await request(app).put('/api/notes-scratch').set('Authorization', `Bearer ${token}`).send(payload);
    const res = await request(app).get('/api/notes-scratch').set('Authorization', `Bearer ${token}`).send();
    expect(res.body).toEqual(payload);
  });

  test('rejects unauthenticated access', async () => {
    const res = await request(app).get('/api/schedule-planner');
    expect(res.status).toBe(401);
  });
});

describe('/api/settings (database-backed tab)', () => {
  let token;

  beforeAll(async () => {
    const email = uniqueEmail('settings');
    const password = uniquePassword();
    const signup = await request(app).post('/api/auth/signup').send({ name: 'Settings Test', email, password });
    token = signup.body.token;
  });

  afterAll(async () => {
    await cleanupTestUsers(db);
  });

  test('GET returns default settings for a brand-new user', async () => {
    const res = await request(app).get('/api/settings').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('notifications');
    expect(res.body).toHaveProperty('privacy');
  });

  test('PUT persists settings to PostgreSQL, not just the response body', async () => {
    const res = await request(app)
      .put('/api/settings')
      .set('Authorization', `Bearer ${token}`)
      .send({ notifications: { friendRequests: false, messages: true }, privacy: { showStudyStats: false, showOnlineStatus: true } });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const getRes = await request(app).get('/api/settings').set('Authorization', `Bearer ${token}`);
    expect(getRes.body.notifications.friendRequests).toBe(false);
    expect(getRes.body.privacy.showStudyStats).toBe(false);
  });
});

afterAll(async () => {
  await db.end();
});
