const request = require('supertest');
const { app, db } = require('../index');
const { uniqueEmail, uniquePassword, cleanupTestUsers } = require('./testHelpers');

// End-to-end coverage of the relational friends/friend_requests tables:
// send -> list -> accept/decline/cancel -> remove, with white-box checks
// that each transition lands correctly in PostgreSQL (not just the response).
describe('Friend request lifecycle', () => {
  let userA, userB, tokenA, tokenB;

  const signup = async (label) => {
    const email = uniqueEmail(label);
    const password = uniquePassword();
    const res = await request(app).post('/api/auth/signup').send({ name: label, email, password });
    return { id: res.body.user.id, email, token: res.body.token };
  };

  beforeEach(async () => {
    userA = await signup('userA');
    userB = await signup('userB');
    tokenA = userA.token;
    tokenB = userB.token;
  });

  afterAll(async () => {
    await cleanupTestUsers(db);
    await db.end();
  });

  test('send-request creates a pending row visible to both sides', async () => {
    const res = await request(app)
      .post('/api/friends/send-request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: userB.email });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const dbRow = await db.query('SELECT * FROM friend_requests WHERE id = $1', [res.body.requestId]);
    expect(dbRow.rows[0]).toMatchObject({ from_id: userA.id, to_id: userB.id, status: 'pending' });

    const listA = await request(app).get('/api/friends').set('Authorization', `Bearer ${tokenA}`);
    expect(listA.body.pendingRequests).toEqual(
      expect.arrayContaining([expect.objectContaining({ toId: userB.id, direction: 'outgoing' })])
    );

    const listB = await request(app).get('/api/friends').set('Authorization', `Bearer ${tokenB}`);
    expect(listB.body.pendingRequests).toEqual(
      expect.arrayContaining([expect.objectContaining({ fromId: userA.id })])
    );
  });

  test('rejects sending a request to yourself', async () => {
    const res = await request(app)
      .post('/api/friends/send-request')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ email: userA.email });
    expect(res.status).toBe(400);
  });

  test('rejects a duplicate pending request', async () => {
    await request(app).post('/api/friends/send-request').set('Authorization', `Bearer ${tokenA}`).send({ email: userB.email });
    const res = await request(app).post('/api/friends/send-request').set('Authorization', `Bearer ${tokenA}`).send({ email: userB.email });
    expect(res.status).toBe(400);
  });

  test('accept-request inserts both directions into friends', async () => {
    const sendRes = await request(app).post('/api/friends/send-request').set('Authorization', `Bearer ${tokenA}`).send({ email: userB.email });
    const requestId = sendRes.body.requestId;

    const acceptRes = await request(app)
      .post('/api/friends/accept-request')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ requestId });
    expect(acceptRes.status).toBe(200);

    const forward = await db.query('SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2', [userA.id, userB.id]);
    const reverse = await db.query('SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2', [userB.id, userA.id]);
    expect(forward.rows).toHaveLength(1);
    expect(reverse.rows).toHaveLength(1);

    const statusRow = await db.query('SELECT status FROM friend_requests WHERE id = $1', [requestId]);
    expect(statusRow.rows[0].status).toBe('accepted');
  });

  test('only the request recipient can accept it', async () => {
    const sendRes = await request(app).post('/api/friends/send-request').set('Authorization', `Bearer ${tokenA}`).send({ email: userB.email });
    const res = await request(app)
      .post('/api/friends/accept-request')
      .set('Authorization', `Bearer ${tokenA}`) // sender, not recipient
      .send({ requestId: sendRes.body.requestId });
    expect(res.status).toBe(403);
  });

  test('decline-request marks the row declined without creating a friendship', async () => {
    const sendRes = await request(app).post('/api/friends/send-request').set('Authorization', `Bearer ${tokenA}`).send({ email: userB.email });
    const res = await request(app)
      .post('/api/friends/decline-request')
      .set('Authorization', `Bearer ${tokenB}`)
      .send({ requestId: sendRes.body.requestId });
    expect(res.status).toBe(200);

    const statusRow = await db.query('SELECT status FROM friend_requests WHERE id = $1', [sendRes.body.requestId]);
    expect(statusRow.rows[0].status).toBe('declined');

    const friendRow = await db.query('SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2', [userA.id, userB.id]);
    expect(friendRow.rows).toHaveLength(0);
  });

  test('cancel-request deletes the row and only the sender may cancel', async () => {
    const sendRes = await request(app).post('/api/friends/send-request').set('Authorization', `Bearer ${tokenA}`).send({ email: userB.email });
    const requestId = sendRes.body.requestId;

    const forbidden = await request(app).post('/api/friends/cancel-request').set('Authorization', `Bearer ${tokenB}`).send({ requestId });
    expect(forbidden.status).toBe(403);

    const ok = await request(app).post('/api/friends/cancel-request').set('Authorization', `Bearer ${tokenA}`).send({ requestId });
    expect(ok.status).toBe(200);

    const row = await db.query('SELECT 1 FROM friend_requests WHERE id = $1', [requestId]);
    expect(row.rows).toHaveLength(0);
  });

  test('remove deletes the friendship in both directions', async () => {
    const sendRes = await request(app).post('/api/friends/send-request').set('Authorization', `Bearer ${tokenA}`).send({ email: userB.email });
    await request(app).post('/api/friends/accept-request').set('Authorization', `Bearer ${tokenB}`).send({ requestId: sendRes.body.requestId });

    const res = await request(app)
      .post('/api/friends/remove')
      .set('Authorization', `Bearer ${tokenA}`)
      .send({ friendId: userB.id });
    expect(res.status).toBe(200);

    const forward = await db.query('SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2', [userA.id, userB.id]);
    const reverse = await db.query('SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2', [userB.id, userA.id]);
    expect(forward.rows).toHaveLength(0);
    expect(reverse.rows).toHaveLength(0);
  });
});
