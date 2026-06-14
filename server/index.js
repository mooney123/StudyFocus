require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const multer = require('multer');
const http = require('http');
const https = require('https');
const { Server } = require('socket.io');
const { Pool } = require('pg');

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'studyfocus',
  user: process.env.DB_USER || 'mooneyfounas',
  password: process.env.DB_PASSWORD || ''
});

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_ORIGIN || "http://localhost:3000",
    methods: ["GET", "POST"]
  }
});
const PORT = process.env.PORT || 3001;
const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Initialize users file if it doesn't exist
if (!fs.existsSync(USERS_FILE)) {
  fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
}

// Helper functions
const readData = (filename) => {
  const filepath = path.join(DATA_DIR, filename.endsWith('.json') ? filename : `${filename}.json`);
  if (!fs.existsSync(filepath)) {
    return null;
  }
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (error) {
    console.error(`Error reading ${filename}:`, error);
    return null;
  }
};

// ─── Safe JSON read ─────────────────────────────────────────────────────────
//
// Bare `JSON.parse(fs.readFileSync(path, 'utf8'))` crashes the whole request
// if the file is empty, partially-written, or corrupted.  Every inline read
// is wrapped with this helper so a bad file returns the fallback value instead
// of throwing and taking the server down.
const safeReadJson = (filepath, fallback = null) => {
  try {
    const raw = fs.readFileSync(filepath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[safeReadJson] Failed to parse ${filepath}:`, err.message);
    return fallback;
  }
};
// ─────────────────────────────────────────────────────────────────────────────

// ─── Atomic JSON write ───────────────────────────────────────────────────────
//
// Plain fs.writeFileSync truncates the file before writing.  If the process
// is killed (crash, SIGTERM from nodemon, OS-level OOM) mid-write the file
// ends up empty or with a partial JSON payload — the next read throws
// "SyntaxError: Unexpected end of JSON input" and the in-memory server state
// diverges from storage.
//
// The write-then-rename pattern is atomic on POSIX file systems (Linux/macOS):
// we serialise to a sibling temp file, then atomically swap it into place with
// fs.renameSync.  Readers always see either the old complete file or the new
// complete file — never a half-written one.  Windows does not guarantee this
// but it's still far safer than a direct overwrite.
//
// All inline fs.writeFileSync(…, JSON.stringify(…)) calls have been replaced
// with atomicWriteJson below.
const atomicWriteJson = (filepath, data) => {
  const tmp = filepath + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf8');
  fs.renameSync(tmp, filepath);
};

const writeData = (filename, data) => {
  const filepath = path.join(DATA_DIR, filename.endsWith('.json') ? filename : `${filename}.json`);
  try {
    atomicWriteJson(filepath, data);
    return true;
  } catch (error) {
    console.error(`Error writing ${filename}:`, error);
    return false;
  }
};

const getUserById = async (userId) => {
  try {
    const result = await db.query('SELECT id, name, email FROM users WHERE id = $1', [userId]);
    return result.rows[0] || null;
  } catch (err) {
    console.error('getUserById error:', err);
    return null;
  }
};

// Simple JWT-like token (in production, use jsonwebtoken library)
const generateToken = (userId) => {
  const payload = {
    userId,
    timestamp: Date.now()
  };
  return Buffer.from(JSON.stringify(payload)).toString('base64');
};

const verifyToken = (token) => {
  try {
    const payload = JSON.parse(Buffer.from(token, 'base64').toString());
    return payload;
  } catch (error) {
    return null;
  }
};

// Authentication middleware
const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }

  const token = authHeader.substring(7);
  const payload = verifyToken(token);

  if (!payload || !payload.userId) {
    return res.status(401).json({ error: 'Invalid token' });
  }

  try {
    const result = await db.query(
      'SELECT id, name, email FROM users WHERE id = $1',
      [payload.userId]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'User not found' });
    }

    req.user = result.rows[0];
    next();
  } catch (err) {
    console.error('Auth middleware error:', err);
    return res.status(500).json({ error: 'Authentication error' });
  }
};

// Upload configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + '-' + file.originalname);
  }
});

const upload = multer({ storage });

// Authentication routes
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // Check if user already exists
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists' });
    }

    // Hash password and create user
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    const id = Date.now().toString();

    await db.query(
      'INSERT INTO users (id, name, email, password) VALUES ($1, $2, $3, $4)',
      [id, name, email, hashedPassword]
    );

    const token = generateToken(id);
    res.json({ user: { id, name, email }, token });
  } catch (err) {
    console.error('Signup error:', err);
    res.status(500).json({ error: 'Failed to create account' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const hashedPassword = crypto.createHash('sha256').update(password).digest('hex');
    const result = await db.query(
      'SELECT id, name, email FROM users WHERE email = $1 AND password = $2',
      [email, hashedPassword]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const token = generateToken(user.id);
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/api/auth/verify', authenticateUser, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email
    }
  });
});

app.get('/api/auth/verify', authenticateUser, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      name: req.user.name,
      email: req.user.email
    }
  });
});

// AI endpoints (must be before /api/:tab route to avoid route conflicts)
app.get('/api/ai/user-data', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    // Fetch study sessions from database
    const sessionsResult = await db.query(
      'SELECT * FROM study_sessions WHERE user_id = $1 ORDER BY start_time DESC',
      [userId]
    );
    const studySessions = sessionsResult.rows.map(r => ({
      id: r.id,
      type: r.type,
      duration: r.duration,
      startTime: r.start_time,
      endTime: r.end_time,
      status: r.status,
      subject: r.subject || '',
      notes: r.notes || '',
      actualDuration: r.actual_duration,
      date: r.date ? r.date.toISOString().split('T')[0] : undefined
    }));

    const userData = {
      userId,
      userName: req.user.name,
      timestamp: new Date().toISOString(),
      studySessions,
      schedulePlanner: (() => {
        const scheduleData = readData(`user_${userId}_schedule-planner`);
        return scheduleData || {};
      })(),
      studyTogetherSessions: (() => {
        const sessionsData = readData(`user_${userId}_study-sessions`);
        return {
          scheduledSessions: sessionsData?.scheduledSessions || [],
          pendingRequests: sessionsData?.pendingRequests || []
        };
      })(),
      stats: (() => {
        const statsData = readData(`user_${userId}_stats`);
        return statsData || {};
      })(),
      notes: studySessions
        .filter(s => s.notes && s.notes.trim())
        .map(s => ({
          id: s.id,
          subject: s.subject,
          notes: s.notes,
          date: s.date || s.startTime,
          sessionType: s.type
        })),
      health: (() => {
        const healthData = readData(`user_${userId}_health`);
        return healthData || {};
      })(),
      sleep: (() => {
        const sleepData = readData(`user_${userId}_sleep`);
        return sleepData || {};
      })()
    };
    res.json(userData);
  } catch (error) {
    console.error('Error fetching AI user data:', error);
    res.status(500).json({ error: 'Failed to fetch user data for AI' });
  }
});

// AI chat endpoint - proxies OpenAI API calls
app.post('/api/ai/chat', authenticateUser, (req, res) => {
  try {
    const { messages, model = 'gpt-4', temperature = 0.7, max_tokens = 2000 } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const openaiApiKey = process.env.OPENAI_API_KEY;
    if (!openaiApiKey) {
      console.error('OpenAI API key is not configured. Please set OPENAI_API_KEY in your .env file.');
      return res.status(500).json({ error: 'OpenAI API key is not configured on the server. Please set OPENAI_API_KEY in your .env file and restart the server.' });
    }

    // Use Node.js built-in https module instead of fetch for compatibility
    const requestData = JSON.stringify({
      model,
      messages,
      temperature,
      max_tokens
    });

    const options = {
      hostname: 'api.openai.com',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Length': Buffer.byteLength(requestData)
      }
    };

    const httpsReq = https.request(options, (httpsRes) => {
      let responseData = '';

      httpsRes.on('data', (chunk) => {
        responseData += chunk;
      });

      httpsRes.on('end', () => {
        try {
          const data = JSON.parse(responseData);
          
          if (httpsRes.statusCode !== 200) {
            console.error('OpenAI API Error:', httpsRes.statusCode, data);
            return res.status(httpsRes.statusCode).json({ 
              error: `OpenAI API error: ${httpsRes.statusCode} - ${data.error?.message || 'Unknown error'}`,
              details: data
            });
          }

          res.json(data);
        } catch (parseError) {
          console.error('Error parsing OpenAI response:', parseError);
          res.status(500).json({ error: 'Failed to parse OpenAI API response' });
        }
      });
    });

    httpsReq.on('error', (error) => {
      console.error('Error calling OpenAI API:', error);
      res.status(500).json({ error: error.message || 'Failed to call OpenAI API' });
    });

    httpsReq.write(requestData);
    httpsReq.end();
  } catch (error) {
    console.error('Error in AI chat endpoint:', error);
    res.status(500).json({ error: error.message || 'Failed to call OpenAI API' });
  }
});

// Leaderboard API Endpoint (must be before /api/:tab route)
app.get('/api/leaderboard', authenticateUser, async (req, res) => {
  console.log('Leaderboard endpoint called');
  const userId = req.user.id;
  
  try {
    // Get user's friends — guard against missing/corrupted file so the
    // leaderboard still renders for new users who have no friends file yet.
    const userFriends = readData(`user_${userId}_friends`);
    const friends = userFriends?.friends || [];
    
    // Create leaderboard data array starting with current user
    const leaderboardData = [];
    
    // Get all user IDs to fetch data for (current user + friends)
    const allUserIds = [userId, ...friends.map(f => f.id)];
    
    // Calculate one week ago (using date string for reliable comparison)
    const now = new Date();
    const oneWeekAgo = new Date(now);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    oneWeekAgo.setHours(0, 0, 0, 0);
    const oneWeekAgoStr = oneWeekAgo.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    console.log('Leaderboard: One week ago date string:', oneWeekAgoStr);
    console.log('Leaderboard: Found', friends.length, 'friends for user', userId);
    
    // Function to calculate study score (same as client)
    const calculateStudyScore = (sessions, totalMinutes, averageDuration, completionRate) => {
      const studyScore = ((sessions * 10) + (totalMinutes * 0.5) + (averageDuration * 2) + (completionRate * 5)) / 20;
      return Math.round(studyScore * 10) / 10; // Round to 1 decimal place
    };
    
    // Helper to get date string from session
    const getSessionDateStr = (session) => {
      if (session.date) {
        // If it's already in YYYY-MM-DD format, use it directly
        if (typeof session.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(session.date)) {
          return session.date;
        }
        // Otherwise parse it
        const date = new Date(session.date);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
      if (session.startTime) {
        const date = new Date(session.startTime);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      }
      return null;
    };
    
    for (const uid of allUserIds) {
      // Get user info
      const userData = await getUserById(uid);
      if (!userData) {
        console.log('Leaderboard: User not found for ID:', uid);
        continue;
      }

      // Check privacy settings from database
      const settingsResult = await db.query('SELECT privacy_show_study_stats FROM user_settings WHERE user_id = $1', [uid]);
      const showStudyStats = settingsResult.rows[0]?.privacy_show_study_stats !== false;
      
      if (!showStudyStats) {
        console.log(`Leaderboard: User ${userData.name} (${uid}) has privacy setting showStudyStats=false, excluding from leaderboard`);
        continue; // Skip this user entirely - they will not appear on leaderboard for anyone
      }
      
      // Get study session data from database
      const sessionsResult = await db.query(
        'SELECT * FROM study_sessions WHERE user_id = $1',
        [uid]
      );
      const sessions = sessionsResult.rows.map(r => ({
        id: r.id,
        type: r.type,
        status: r.status,
        actualDuration: r.actual_duration,
        startTime: r.start_time,
        date: r.date ? r.date.toISOString().split('T')[0] : null
      }));

      console.log(`Leaderboard: User ${userData.name} (${uid}) has ${sessions.length} total sessions`);

      // Filter sessions from last week only
      const recentSessions = sessions.filter(session => {
        const sessionDateStr = getSessionDateStr(session);
        if (!sessionDateStr) {
          return false; // Skip if no valid date
        }
        // Compare date strings directly (YYYY-MM-DD format)
        return sessionDateStr >= oneWeekAgoStr;
      });
      
      console.log(`Leaderboard: User ${userData.name} has ${recentSessions.length} sessions in last 7 days`);
      
      // Calculate statistics (always include user, even with zeros)
      const totalSessions = recentSessions.length;
      const completedSessions = recentSessions.filter(s => s.status === 'completed').length;
      const totalMinutes = recentSessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
      const averageDuration = totalSessions > 0 ? Math.round(totalMinutes / totalSessions) : 0;
      const completionRate = totalSessions > 0 ? Math.round((completedSessions / totalSessions) * 100) : 0;
      
      // Calculate study score
      const studyScore = calculateStudyScore(totalSessions, totalMinutes, averageDuration, completionRate);
      
      // Always include user (even with no activity)
      leaderboardData.push({
        userId: uid,
        name: userData.name,
        sessions: totalSessions,
        totalMinutes: totalMinutes,
        averageDuration: averageDuration,
        completionRate: completionRate,
        studyScore: studyScore
      });
    }
    
    // Sort by study score (descending)
    leaderboardData.sort((a, b) => b.studyScore - a.studyScore);
    
    console.log('Leaderboard: Returning', leaderboardData.length, 'users');
    console.log('Leaderboard: User names:', leaderboardData.map(u => u.name));
    
    res.json(leaderboardData);
  } catch (error) {
    console.error('Error generating leaderboard:', error);
    res.status(500).json({ error: 'Failed to generate leaderboard' });
  }
});

// Data routes for tabs
// Helper: ensure a user_settings row exists (upsert defaults)
const ensureUserSettings = async (userId) => {
  await db.query(`
    INSERT INTO user_settings (user_id) VALUES ($1)
    ON CONFLICT (user_id) DO NOTHING
  `, [userId]);
};

// Helper: read settings from database and return in legacy JSON shape
const getSettingsForUser = async (userId) => {
  await ensureUserSettings(userId);
  const result = await db.query('SELECT * FROM user_settings WHERE user_id = $1', [userId]);
  const row = result.rows[0];
  return {
    notifications: {
      friendRequests: row.notifications_friend_requests,
      messages: row.notifications_messages
    },
    privacy: {
      showStudyStats: row.privacy_show_study_stats,
      showOnlineStatus: row.privacy_show_online_status
    },
    hasSeenOnboarding: row.has_seen_onboarding,
    hasSeenWelcome: row.has_seen_welcome
  };
};

// Helper: build a study-session response object from database
const getStudySessionData = async (userId) => {
  const sessionsResult = await db.query(
    `SELECT * FROM study_sessions WHERE user_id = $1 ORDER BY start_time DESC`,
    [userId]
  );
  const sessions = sessionsResult.rows.map(r => ({
    id: r.id,
    type: r.type,
    duration: r.duration,
    startTime: r.start_time,
    endTime: r.end_time,
    status: r.status,
    subject: r.subject || '',
    notes: r.notes || '',
    timeLeft: r.time_left,
    actualDuration: r.actual_duration,
    date: r.date ? r.date.toISOString().split('T')[0] : undefined
  }));

  const settingsResult = await db.query(
    'SELECT * FROM study_session_settings WHERE user_id = $1',
    [userId]
  );
  const s = settingsResult.rows[0];
  const settings = s ? {
    pomodoro: {
      workTime: s.pomodoro_work_time,
      breakTime: s.pomodoro_break_time,
      longBreakTime: s.pomodoro_long_break_time
    },
    notifications: s.notifications,
    gradientTheme: s.gradient_theme,
    shortBreak: s.short_break
  } : { pomodoro: { workTime: 25, breakTime: 5, longBreakTime: 15 }, notifications: true };

  const totalSessions = sessions.length;
  const totalTime = sessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);

  return {
    title: "Study Session",
    description: "Track your study sessions and maintain focus",
    sessions,
    settings,
    totalSessions,
    totalTime,
    currentSubject: s?.current_subject || '',
    sessionNotes: s?.session_notes || '',
    activeSession: s?.active_session || null,
    lastUpdated: s?.updated_at || new Date().toISOString(),
    userId
  };
};

// Helper: upsert study-session settings and replace all sessions for the user
const saveStudySessionData = async (userId, data) => {
  const settings = data.settings || {};
  const pomodoro = settings.pomodoro || {};

  // Upsert settings row
  await db.query(
    `INSERT INTO study_session_settings
       (user_id, pomodoro_work_time, pomodoro_break_time, pomodoro_long_break_time,
        notifications, gradient_theme, short_break, current_subject, session_notes, active_session, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
     ON CONFLICT (user_id) DO UPDATE SET
       pomodoro_work_time = EXCLUDED.pomodoro_work_time,
       pomodoro_break_time = EXCLUDED.pomodoro_break_time,
       pomodoro_long_break_time = EXCLUDED.pomodoro_long_break_time,
       notifications = EXCLUDED.notifications,
       gradient_theme = EXCLUDED.gradient_theme,
       short_break = EXCLUDED.short_break,
       current_subject = EXCLUDED.current_subject,
       session_notes = EXCLUDED.session_notes,
       active_session = EXCLUDED.active_session,
       updated_at = NOW()`,
    [
      userId,
      pomodoro.workTime || 25,
      pomodoro.breakTime || 5,
      pomodoro.longBreakTime || 15,
      settings.notifications !== false,
      settings.gradientTheme || null,
      settings.shortBreak || null,
      data.currentSubject || null,
      data.sessionNotes || null,
      data.activeSession ? JSON.stringify(data.activeSession) : null
    ]
  );

  // Upsert each session (don't delete — the client sends back all sessions)
  const sessions = Array.isArray(data.sessions) ? data.sessions : [];
  for (const s of sessions) {
    await db.query(
      `INSERT INTO study_sessions
         (id, user_id, type, duration, start_time, end_time, status, subject, notes, time_left, actual_duration, date)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         type = EXCLUDED.type,
         duration = EXCLUDED.duration,
         start_time = EXCLUDED.start_time,
         end_time = EXCLUDED.end_time,
         status = EXCLUDED.status,
         subject = EXCLUDED.subject,
         notes = EXCLUDED.notes,
         time_left = EXCLUDED.time_left,
         actual_duration = EXCLUDED.actual_duration,
         date = EXCLUDED.date`,
      [
        s.id,
        userId,
        s.type || null,
        s.duration || null,
        s.startTime || null,
        s.endTime || null,
        s.status || null,
        s.subject || null,
        s.notes || null,
        s.timeLeft || null,
        s.actualDuration || null,
        s.date || null
      ]
    );
  }
};

app.get('/api/:tab', authenticateUser, async (req, res) => {
  const { tab } = req.params;
  const userId = req.user.id;

  // Settings are now served from database
  if (tab === 'settings') {
    try {
      const settings = await getSettingsForUser(userId);
      return res.json(settings);
    } catch (err) {
      console.error('Error reading settings:', err);
      return res.status(500).json({ error: 'Failed to load settings' });
    }
  }

  // Study sessions are now served from database
  if (tab === 'study-session') {
    try {
      const data = await getStudySessionData(userId);
      return res.json(data);
    } catch (err) {
      console.error('Error reading study sessions:', err);
      return res.status(500).json({ error: 'Failed to load study sessions' });
    }
  }

  // All other tabs still use JSON files
  const filename = `user_${userId}_${tab}.json`;
  const data = readData(filename);

  if (data === null) {
    const defaults = {
      'schedule-planner': {
        title: "Schedule Planner",
        description: "Plan your weekly schedule",
        generatedSchedule: {},
        extractedClasses: []
      }
    };
    return res.json(defaults[tab] || {});
  }

  res.json(data);
});

app.put('/api/:tab', authenticateUser, async (req, res) => {
  const { tab } = req.params;
  const userId = req.user.id;
  const data = req.body;

  // Settings are now saved to database
  if (tab === 'settings') {
    try {
      await ensureUserSettings(userId);
      const oldSettings = await getSettingsForUser(userId);
      const oldShowOnlineStatus = oldSettings.privacy.showOnlineStatus;
      const newShowOnlineStatus = data?.privacy?.showOnlineStatus !== false;

      await db.query(`
        UPDATE user_settings SET
          notifications_friend_requests = $1,
          notifications_messages = $2,
          privacy_show_study_stats = $3,
          privacy_show_online_status = $4,
          updated_at = NOW()
        WHERE user_id = $5
      `, [
        data?.notifications?.friendRequests !== false,
        data?.notifications?.messages !== false,
        data?.privacy?.showStudyStats !== false,
        newShowOnlineStatus,
        userId
      ]);

      if (oldShowOnlineStatus !== newShowOnlineStatus) {
        updateUserPresence(userId);
      }

      return res.json({ success: true, message: 'Settings saved successfully' });
    } catch (err) {
      console.error('Error saving settings:', err);
      return res.status(500).json({ error: 'Failed to save settings' });
    }
  }

  // Study sessions are now saved to database
  if (tab === 'study-session') {
    try {
      await saveStudySessionData(userId, data);
      return res.json({ success: true, message: 'Data saved successfully' });
    } catch (err) {
      console.error('Error saving study sessions:', err);
      return res.status(500).json({ error: 'Failed to save study sessions' });
    }
  }

  // All other tabs still use JSON files
  const filename = `user_${userId}_${tab}.json`;
  writeData(filename, data);
  res.json({ success: true, message: 'Data saved successfully' });
});

// Onboarding tracking endpoint
app.get('/api/onboarding/status', authenticateUser, async (req, res) => {
  try {
    await ensureUserSettings(req.user.id);
    const result = await db.query('SELECT has_seen_onboarding FROM user_settings WHERE user_id = $1', [req.user.id]);
    res.json({ hasSeenOnboarding: result.rows[0]?.has_seen_onboarding || false });
  } catch (err) {
    console.error('Error reading onboarding status:', err);
    res.status(500).json({ error: 'Failed to load onboarding status' });
  }
});

app.put('/api/onboarding/status', authenticateUser, async (req, res) => {
  try {
    await ensureUserSettings(req.user.id);
    await db.query('UPDATE user_settings SET has_seen_onboarding = $1, updated_at = NOW() WHERE user_id = $2',
      [req.body.hasSeenOnboarding || true, req.user.id]);
    res.json({ success: true, hasSeenOnboarding: true });
  } catch (err) {
    console.error('Error updating onboarding status:', err);
    res.status(500).json({ error: 'Failed to update onboarding status' });
  }
});

// Welcome modal tracking endpoint
app.get('/api/welcome/status', authenticateUser, async (req, res) => {
  try {
    await ensureUserSettings(req.user.id);
    const result = await db.query('SELECT has_seen_welcome FROM user_settings WHERE user_id = $1', [req.user.id]);
    res.json({ hasSeenWelcome: result.rows[0]?.has_seen_welcome || false });
  } catch (err) {
    console.error('Error reading welcome status:', err);
    res.status(500).json({ error: 'Failed to load welcome status' });
  }
});

app.put('/api/welcome/status', authenticateUser, async (req, res) => {
  try {
    await ensureUserSettings(req.user.id);
    await db.query('UPDATE user_settings SET has_seen_welcome = $1, updated_at = NOW() WHERE user_id = $2',
      [req.body.hasSeenWelcome || true, req.user.id]);
    res.json({ success: true, hasSeenWelcome: true });
  } catch (err) {
    console.error('Error updating welcome status:', err);
    res.status(500).json({ error: 'Failed to update welcome status' });
  }
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Study Together routes
app.post('/api/study-together/create', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { subject, studyType, duration, scheduledFor } = req.body;
  
  const sessionId = Date.now().toString();
  const newSession = {
    id: sessionId,
    subject,
    studyType,
    duration,
    scheduledFor,
    status: 'waiting',
    creatorId: userId,
    participants: [{
      userId,
    name: req.user.name,
      email: req.user.email,
      joinedAt: new Date().toISOString(),
      isReady: false
    }],
    createdAt: new Date().toISOString(),
    startedAt: null,
    endedAt: null
  };

  // Save to all sessions file
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  let allSessions = [];
  if (fs.existsSync(allSessionsFile)) {
    allSessions = safeReadJson(allSessionsFile, []);
  }
  allSessions.push(newSession);
  atomicWriteJson(allSessionsFile, allSessions);

  res.json(newSession);
});

app.post('/api/study-together/join', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.body;
  
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Validate user is authorized to join (must be creator or invited friend)
  const isCreator = String(session.creatorId) === String(userId);
  const isFriend = session.friendId && String(session.friendId) === String(userId);
  
  if (!isCreator && !isFriend) {
    return res.status(403).json({ error: 'You are not authorized to join this session' });
  }
  
  // Validate session is accepted or active before joining
  if (session.status !== 'accepted' && session.status !== 'active') {
    return res.status(400).json({ error: 'Session must be accepted or active before joining' });
  }
  
  // Check if user is already a participant
  const existingParticipant = session.participants?.find(p => String(p.userId) === String(userId));
  if (existingParticipant) {
    // Update existing participant (rejoining)
    existingParticipant.isReady = false;
    existingParticipant.joinedAt = new Date().toISOString();
  } else {
    // Add user as participant (rejoining after leaving, or first time joining)
    session.participants = session.participants || [];
    session.participants.push({
      userId,
      name: req.user.name,
      email: req.user.email,
      joinedAt: new Date().toISOString(),
      isReady: false
    });
  }

  // Save updated sessions
  const index = allSessions.findIndex(s => s.id === sessionId);
  allSessions[index] = session;
  atomicWriteJson(allSessionsFile, allSessions);

  // Create or get session state
  let sessionState = null;
  if (session.status === 'active') {
    const sessionStateFile = path.join(DATA_DIR, `session_${sessionId}.json`);
    if (fs.existsSync(sessionStateFile)) {
      sessionState = safeReadJson(sessionStateFile, {});
      // Update participants in session state to match session
      sessionState.participants = session.participants || sessionState.participants || [];
      // Save updated state
      atomicWriteJson(sessionStateFile, sessionState);
    } else {
      sessionState = {
        sessionId: session.id,
        isPaused: false,
        participants: session.participants || [],
        timeLeft: session.duration ? session.duration * 60 : 1500,
        status: 'active'
      };
      // Save new state
      atomicWriteJson(sessionStateFile, sessionState);
    }
  } else {
    // Session is accepted but not started yet - return waiting room state
    sessionState = {
      sessionId: session.id,
      isPaused: false,
      participants: session.participants || [],
      timeLeft: session.duration ? session.duration * 60 : 1500,
      status: 'waiting'
    };
  }
  
  // Return enriched session
  const enrichedSession = {
    ...session,
    creatorName: session.creatorName || getUserById(session.creatorId)?.name || 'Unknown',
    friendName: session.friendName || (session.friendId ? getUserById(session.friendId)?.name : null) || 'Unknown'
  };

  res.json({ session: enrichedSession, sessionState });
});

app.post('/api/study-together/ready', authenticateUser, (req, res) => {
  const { sessionId, isReady } = req.body;

  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const participant = session.participants?.find(p => String(p.userId) === String(req.user.id));
  if (participant) {
    participant.isReady = Boolean(isReady);
  }

  const index = allSessions.findIndex(s => s.id === sessionId);
  allSessions[index] = session;
  atomicWriteJson(allSessionsFile, allSessions);

  // Real-time: notify all participants in this session
  const participantIds = (session.participants || []).map(p => p.userId);
  if (participantIds.length) {
    emitToUsers(participantIds, 'study-together:ready-update', {
      sessionId,
      participants: session.participants
    });
  }

  res.json(session);
});

app.get('/api/study-together/sessions', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.json({ scheduledSessions: [], pendingRequests: [] });
  }

  const allSessions = safeReadJson(allSessionsFile, []);

  // Helper to get user name by ID
  const getUserName = async (uid) => {
    const user = await getUserById(uid);
    return user ? user.name : 'Unknown';
  };
  
  // Filter and enrich sessions for this user
  const scheduledSessions = [];
  const pendingRequests = [];
  
  for (const session of allSessions) {
    // Skip cancelled, declined, and ended sessions
    if (session.status === 'cancelled' || session.status === 'declined' || session.status === 'ended') {
      continue;
    }
    
    const isCreator = session.creatorId === userId;
    const isFriend = session.friendId === userId;
    const isParticipant = session.participants?.some(p => String(p.userId) === String(userId));
    
    // Pending requests: User B sees requests where they are the friendId (invited), NOT the creator
    if ((session.status === 'pending' || session.status === 'waiting') && isFriend && !isCreator) {
      const enrichedSession = {
        ...session,
        creatorName: await getUserName(session.creatorId),
        friendName: await getUserName(session.friendId)
      };
      pendingRequests.push(enrichedSession);
    }
    // Scheduled sessions: Accepted or active sessions where user is creator, friend, or participant
    else if ((session.status === 'accepted' || session.status === 'active') && (isCreator || isFriend || isParticipant)) {
      const enrichedSession = {
        ...session,
        creatorName: await getUserName(session.creatorId),
        friendName: session.friendId ? await getUserName(session.friendId) : null
      };
      scheduledSessions.push(enrichedSession);
    }
    // Creator can see their own pending requests in scheduled (not pendingRequests)
    else if (isCreator && session.status === 'pending') {
      const enrichedSession = {
        ...session,
        creatorName: await getUserName(session.creatorId),
        friendName: session.friendId ? await getUserName(session.friendId) : null
      };
      scheduledSessions.push(enrichedSession);
    }
  }

  res.json({ scheduledSessions, pendingRequests });
});

// ─── Server-authoritative timer helpers ─────────────────────────────────────
//
// Study-Together sessions previously accepted client-submitted `timeLeft`
// values in the `/update-state` endpoint.  Any participant (or a browser tab
// that lagged behind) could post `timeLeft: 1` and expire the timer for the
// whole group.
//
// The new approach:
//   • On session start  → store `remainingSeconds = duration * 60` and
//                         `timerStartedAt = now`.
//   • On pause          → snapshot current computed `timeLeft` into
//                         `remainingSeconds`, clear `timerStartedAt`.
//   • On resume         → record new `timerStartedAt`, keep `remainingSeconds`.
//   • On every read     → derive `timeLeft` from the server clock; never trust
//                         the client-supplied value.
//
// Backward-compat: if neither field is present (old state files) the stored
// `timeLeft` field is used as a fall-back so existing sessions keep working.

function computeTimeLeft(state) {
  // New-style: we have the timer anchor timestamps.
  if (state.remainingSeconds !== undefined) {
    if (state.isPaused || !state.timerStartedAt) {
      return Math.max(0, Math.round(state.remainingSeconds));
    }
    const elapsedMs = Date.now() - new Date(state.timerStartedAt).getTime();
    const elapsedSec = elapsedMs / 1000;
    return Math.max(0, Math.round(state.remainingSeconds - elapsedSec));
  }
  // Legacy fall-back: return whatever was last stored.
  return state.timeLeft !== undefined ? Math.max(0, state.timeLeft) : 0;
}
// ─────────────────────────────────────────────────────────────────────────────

app.post('/api/study-together/start', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.body;
  
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Only creator or accepted participant can start
  const isCreator = String(session.creatorId) === String(userId);
  const isParticipant = session.participants?.some(p => String(p.userId) === String(userId));
  if (!isCreator && !isParticipant) {
    return res.status(403).json({ error: 'You are not authorized to start this session' });
  }

  // Update session to active
  session.status = 'active';
  session.startedAt = new Date().toISOString();
  
  // Create and save session state to file
  const sessionStateFile = path.join(DATA_DIR, `session_${sessionId}.json`);
  const nowIso = new Date().toISOString();
  const totalSeconds = session.duration * 60;
  const sessionState = {
    sessionId: session.id,
    isPaused: false,
    participants: session.participants || [],
    // Legacy field kept for display fall-back on old clients.
    timeLeft: totalSeconds,
    // Server-authoritative timer fields.
    remainingSeconds: totalSeconds,
    timerStartedAt: nowIso,
    status: 'active',
    startedAt: nowIso
  };
  atomicWriteJson(sessionStateFile, sessionState);

  const index = allSessions.findIndex(s => s.id === sessionId);
  allSessions[index] = session;
  atomicWriteJson(allSessionsFile, allSessions);

  // Return enriched session
  const enrichedSession = {
    ...session,
    creatorName: session.creatorName || getUserById(session.creatorId)?.name || 'Unknown',
    friendName: session.friendName || (session.friendId ? getUserById(session.friendId)?.name : null) || 'Unknown'
  };

  // Real-time: notify all participants to start at the same time
  const participantIds = (session.participants || []).map(p => p.userId);
  if (participantIds.length) {
    emitToUsers(participantIds, 'study-together:session-started', {
      sessionId,
      session: enrichedSession,
      sessionState
    });
  }

  res.json({ session: enrichedSession, sessionState });
});

// Pause/Resume session
app.post('/api/study-together/pause', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId, isPaused } = req.body;
  
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Validate user is participant
  const isParticipant = session.participants?.some(p => String(p.userId) === String(userId));
  if (!isParticipant) {
    return res.status(403).json({ error: 'You are not authorized to pause this session' });
  }

  // Update session state file
  const sessionStateFile = path.join(DATA_DIR, `session_${sessionId}.json`);
  const pauseNow = isPaused !== undefined ? isPaused : true;

  let sessionState = {
    sessionId: session.id,
    isPaused: pauseNow,
    participants: session.participants || [],
    timeLeft: session.duration ? session.duration * 60 : 1500,
    status: 'active'
  };

  if (fs.existsSync(sessionStateFile)) {
    const existingState = safeReadJson(sessionStateFile, {});
    // Compute how much time was left at this exact moment before we freeze it.
    const currentTimeLeft = computeTimeLeft(existingState);

    sessionState = {
      ...existingState,
      participants: session.participants || existingState.participants || [],
      isPaused: pauseNow,
      timeLeft: currentTimeLeft, // legacy field
    };

    if (pauseNow) {
      // Freeze the clock: snapshot remaining time and clear the running anchor.
      sessionState.remainingSeconds = currentTimeLeft;
      sessionState.timerStartedAt = null;
    } else {
      // Resume: restart the clock from the frozen snapshot.
      sessionState.timerStartedAt = new Date().toISOString();
      // remainingSeconds stays as whatever was frozen at pause time.
    }
  } else {
    // No existing state file — seed server-authoritative fields.
    const total = session.duration ? session.duration * 60 : 1500;
    sessionState.remainingSeconds = total;
    sessionState.timerStartedAt = pauseNow ? null : new Date().toISOString();
  }

  atomicWriteJson(sessionStateFile, sessionState);

  // Return computed timeLeft so clients immediately correct their display.
  sessionState.timeLeft = computeTimeLeft(sessionState);
  res.json({ success: true, sessionState });
});

// Update session state (timer sync)
//
// The client `timeLeft` value in the request body is intentionally ignored.
// The server derives `timeLeft` from its own wall clock using `computeTimeLeft`
// so that no participant can manipulate the shared timer by submitting an
// arbitrary value.  The computed value is returned so all clients can correct
// their local display if they've drifted.
app.post('/api/study-together/update-state', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.body;
  // `timeLeft` from the client is deliberately not extracted — see comment above.

  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  // Validate user is participant
  const isParticipant = session.participants?.some(p => String(p.userId) === String(userId));
  if (!isParticipant) {
    return res.status(403).json({ error: 'You are not authorized to update this session' });
  }

  // Compute timeLeft from the server clock and return it.
  const sessionStateFile = path.join(DATA_DIR, `session_${sessionId}.json`);
  if (fs.existsSync(sessionStateFile)) {
    let sessionState = safeReadJson(sessionStateFile, {});
    sessionState.participants = session.participants || sessionState.participants || [];
    sessionState.isPaused = sessionState.isPaused || false;
    sessionState.status = session.status === 'active' ? 'active' : sessionState.status;

    // Derive the authoritative timeLeft from server timestamps.
    const serverTimeLeft = computeTimeLeft(sessionState);
    // Keep the legacy `timeLeft` field current for old client fall-back.
    sessionState.timeLeft = serverTimeLeft;

    atomicWriteJson(sessionStateFile, sessionState);
    res.json({ success: true, sessionState: { ...sessionState, timeLeft: serverTimeLeft } });
  } else {
    res.status(404).json({ error: 'Session state not found' });
  }
});

app.post('/api/study-together/stop', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.body;
  
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Only creator or any participant can stop the session
  const isCreator = String(session.creatorId) === String(userId);
  const isParticipant = session.participants?.some(p => String(p.userId) === String(userId));
  if (!isCreator && !isParticipant) {
    return res.status(403).json({ error: 'You are not authorized to stop this session' });
  }

  // Update session to completed
  session.status = 'completed';
  session.endedAt = new Date().toISOString();

  // Update session state file
  const sessionStateFile = path.join(DATA_DIR, `session_${sessionId}.json`);
  if (fs.existsSync(sessionStateFile)) {
    let sessionState = safeReadJson(sessionStateFile, {});
    sessionState.status = 'completed';
    sessionState.isPaused = true;
    atomicWriteJson(sessionStateFile, sessionState);
  }

  const index = allSessions.findIndex(s => s.id === sessionId);
  allSessions[index] = session;
  atomicWriteJson(allSessionsFile, allSessions);

  // Return enriched session
  const enrichedSession = {
    ...session,
    creatorName: session.creatorName || getUserById(session.creatorId)?.name || 'Unknown',
    friendName: session.friendName || (session.friendId ? getUserById(session.friendId)?.name : null) || 'Unknown'
  };

  res.json({ success: true, session: enrichedSession });
});

app.post('/api/study-together/leave', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.body;
  
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }

  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Remove user from participants (but keep them in session so they can rejoin)
  session.participants = session.participants.filter(p => String(p.userId) !== String(userId));

  // Only mark as ended if session is completed/stopped, not just because someone left
  // Users should be able to rejoin active sessions
  // Don't change session status on leave - only on explicit stop/end

  const index = allSessions.findIndex(s => s.id === sessionId);
  allSessions[index] = session;
  atomicWriteJson(allSessionsFile, allSessions);

  // Also update session state file to remove from participants there
  const sessionStateFile = path.join(DATA_DIR, `session_${sessionId}.json`);
  if (fs.existsSync(sessionStateFile)) {
    let sessionState = safeReadJson(sessionStateFile, {});
    sessionState.participants = sessionState.participants.filter(p => String(p.userId) !== String(userId));
    atomicWriteJson(sessionStateFile, sessionState);
  }

  res.json({ success: true, message: 'Left session successfully' });
});

app.post('/api/study-together/test-session', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { subject, studyType, duration } = req.body;

  const sessionId = Date.now().toString();
  const newSession = {
    id: sessionId,
    subject: subject || 'Test Session',
    studyType: studyType || 'pomodoro',
    duration: duration || 25,
    status: 'active',
    creatorId: userId,
    participants: [{
      userId,
    name: req.user.name,
    email: req.user.email,
    joinedAt: new Date().toISOString(),
      isReady: true
    }],
    createdAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    endedAt: null
  };

  // Save to all sessions file
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  let allSessions = [];
  if (fs.existsSync(allSessionsFile)) {
    allSessions = safeReadJson(allSessionsFile, []);
  }
  allSessions.push(newSession);
  atomicWriteJson(allSessionsFile, allSessions);

  // Create session state
  const sessionState = {
    sessionId: newSession.id,
    isPaused: false,
    participants: newSession.participants,
    timeLeft: newSession.duration * 60,
    status: 'active'
  };

  res.json({ session: newSession, sessionState });
});

// Schedule a study session with a friend
app.post('/api/study-together/schedule', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  const { friendId, subject, studyType, duration, scheduledDate, scheduledTime } = req.body;
  
  if (!friendId || !subject || !scheduledDate || !scheduledTime) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  
  // Validate friendId is not the same as userId (can't invite yourself)
  if (String(friendId) === String(userId)) {
    return res.status(400).json({ error: 'Cannot schedule a session with yourself' });
  }
  
  // Validate friend exists
  const friend = await getUserById(friendId);
  if (!friend) {
    return res.status(404).json({ error: 'Friend not found' });
  }
  
  // Create scheduled session
  const sessionId = Date.now().toString();
  const scheduledFor = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
  
  // Only creator in participants initially - friend will be added when they accept
  const newSession = {
    id: sessionId,
    subject,
    studyType: studyType || 'pomodoro',
    duration: duration || 25,
    scheduledFor,
    status: 'pending',
    creatorId: userId,
    creatorName: req.user.name, // Store creator name
    friendId: friendId, // The friend being invited
    friendName: friend.name, // Store friend name
    participants: [{
      userId,
    name: req.user.name,
    email: req.user.email,
    joinedAt: new Date().toISOString(),
    isReady: false
    }],
    createdAt: new Date().toISOString(),
    startedAt: null,
    endedAt: null
  };
  
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  let allSessions = [];
  if (fs.existsSync(allSessionsFile)) {
    allSessions = safeReadJson(allSessionsFile, []);
  }
  allSessions.push(newSession);
  atomicWriteJson(allSessionsFile, allSessions);

  // Real-time: notify recipient immediately
  const enrichedForRecipient = {
    ...newSession,
    creatorName: req.user.name,
    friendName: friend.name
  };
  emitToUser(friendId, 'study-together:invite', enrichedForRecipient);

  res.json(newSession);
});

// Accept a pending study session request
app.post('/api/study-together/accept', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.body;
  
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Validate user is the friend who was invited (can't accept someone else's invitation)
  if (String(session.friendId) !== String(userId)) {
    return res.status(403).json({ error: 'You are not authorized to accept this request' });
  }
  
  // Add user as participant if not already
  const existingParticipant = session.participants?.find(p => String(p.userId) === String(userId));
  if (!existingParticipant) {
    session.participants = session.participants || [];
    session.participants.push({
      userId,
      name: req.user.name,
      email: req.user.email,
      joinedAt: new Date().toISOString(),
      isReady: false
    });
  }
  
  // Update status to accepted
  session.status = 'accepted';
  
  const index = allSessions.findIndex(s => s.id === sessionId);
  allSessions[index] = session;
  atomicWriteJson(allSessionsFile, allSessions);

  // Return enriched session with names
  const enrichedSession = {
    ...session,
    creatorName: session.creatorName || getUserById(session.creatorId)?.name || 'Unknown',
    friendName: session.friendName || getUserById(session.friendId)?.name || 'Unknown'
  };

  // Real-time: notify creator that their invite was accepted
  emitToUser(session.creatorId, 'study-together:invite-accepted', enrichedSession);

  res.json(enrichedSession);
});

// Decline a pending study session request
app.post('/api/study-together/decline', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.body;
  
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Validate user is the friend who was invited (can't decline someone else's invitation)
  if (String(session.friendId) !== String(userId)) {
    return res.status(403).json({ error: 'You are not authorized to decline this request' });
  }
  
  // Update status to declined
  session.status = 'declined';
  session.endedAt = new Date().toISOString();

  const index = allSessions.findIndex(s => s.id === sessionId);
  allSessions[index] = session;
  atomicWriteJson(allSessionsFile, allSessions);

  // Real-time: notify creator that their invite was declined
  emitToUser(session.creatorId, 'study-together:invite-declined', { sessionId, session });

  res.json({ success: true, session });
});

// Cancel a scheduled study session
app.post('/api/study-together/cancel', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.body;
  
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  let allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Only creator can cancel
  if (session.creatorId !== userId) {
    return res.status(403).json({ error: 'Only the creator can cancel the session' });
  }
  
  // Update status to cancelled
  session.status = 'cancelled';
  session.endedAt = new Date().toISOString();

  const index = allSessions.findIndex(s => s.id === sessionId);
  allSessions[index] = session;
  atomicWriteJson(allSessionsFile, allSessions);

  // Real-time: notify friend that session was cancelled
  if (session.friendId) {
    emitToUser(session.friendId, 'study-together:session-cancelled', { sessionId, session });
  }

  res.json({ success: true, session });
});

// Get a specific session by ID
app.get('/api/study-together/session/:sessionId', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  
  if (!fs.existsSync(allSessionsFile)) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  const allSessions = safeReadJson(allSessionsFile, []);
  const session = allSessions.find(s => s.id === sessionId);
  
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
  // Validate user is authorized to view this session (creator or friend)
  const isCreator = String(session.creatorId) === String(userId);
  const isFriend = session.friendId && String(session.friendId) === String(userId);
  const isParticipant = session.participants?.some(p => String(p.userId) === String(userId));
  
  if (!isCreator && !isFriend && !isParticipant) {
    return res.status(403).json({ error: 'You are not authorized to view this session' });
  }
  
  // Create session state if session is active
  let sessionState = null;
  if (session.status === 'active') {
    const sessionStateFile = path.join(DATA_DIR, `session_${sessionId}.json`);
    if (fs.existsSync(sessionStateFile)) {
      sessionState = safeReadJson(sessionStateFile, {});
      // Update participants from session to keep them in sync
      sessionState.participants = session.participants || sessionState.participants || [];
      // Ensure status is active
      sessionState.status = 'active';
      // Always derive timeLeft from the server clock so clients receive an
      // authoritative value even if the state file's legacy field is stale.
      sessionState.timeLeft = computeTimeLeft(sessionState);
    } else {
      // Create new state file if it doesn't exist
    sessionState = {
        sessionId: session.id,
        isPaused: false,
        participants: session.participants || [],
        timeLeft: session.duration ? session.duration * 60 : 1500,
        status: 'active',
        startedAt: session.startedAt || new Date().toISOString()
      };
      atomicWriteJson(sessionStateFile, sessionState);
    }
  } else if (session.status === 'accepted') {
    // Session is accepted but not started - return waiting room state
    sessionState = {
      sessionId: session.id,
      isPaused: false,
      participants: session.participants || [],
      timeLeft: session.duration ? session.duration * 60 : 1500,
      status: 'waiting'
    };
  } else if (session.status === 'completed') {
    // Return completed state
    const sessionStateFile = path.join(DATA_DIR, `session_${sessionId}.json`);
    if (fs.existsSync(sessionStateFile)) {
      sessionState = safeReadJson(sessionStateFile, {});
  sessionState.status = 'completed';
  } else {
      sessionState = {
        sessionId: session.id,
        isPaused: true,
        participants: session.participants || [],
        timeLeft: 0,
        status: 'completed'
      };
    }
  }
  
  // Return enriched session with names
  const enrichedSession = {
    ...session,
    creatorName: session.creatorName || getUserById(session.creatorId)?.name || 'Unknown',
    friendName: session.friendName || (session.friendId ? getUserById(session.friendId)?.name : null) || 'Unknown'
  };
  
  res.json({ session: enrichedSession, sessionState });
});

// Chat endpoints
app.post('/api/study-together/chat/send', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId, message } = req.body;
  
  if (!sessionId || !message) {
    return res.status(400).json({ error: 'Session ID and message are required' });
  }
  
  // Validate session exists and user is participant
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (fs.existsSync(allSessionsFile)) {
    const allSessions = safeReadJson(allSessionsFile, []);
    const session = allSessions.find(s => s.id === sessionId);
    
    if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
    // Validate user is participant (creator or friend)
    const isCreator = String(session.creatorId) === String(userId);
    const isFriend = session.friendId && String(session.friendId) === String(userId);
    const isParticipant = session.participants?.some(p => String(p.userId) === String(userId));
    
    if (!isCreator && !isFriend && !isParticipant) {
      return res.status(403).json({ error: 'You are not authorized to send messages in this session' });
    }
  }
  
  const chatFile = path.join(DATA_DIR, `study-together-chat-${sessionId}.json`);
  let messages = [];
  if (fs.existsSync(chatFile)) {
    try {
      messages = safeReadJson(chatFile, []);
    } catch (error) {
      console.error('Error reading chat file:', error);
      messages = [];
    }
  }

  const newMessage = {
    id: Date.now().toString(),
    sessionId,
    userId,
    userName: req.user.name,
    message: message.trim(),
    timestamp: new Date().toISOString()
  };
  
  messages.push(newMessage);
  atomicWriteJson(chatFile, messages);

  res.json({ success: true, message: newMessage });
});

app.get('/api/study-together/chat/:sessionId', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  
  // Validate session exists and user is participant
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (fs.existsSync(allSessionsFile)) {
    const allSessions = safeReadJson(allSessionsFile, []);
    const session = allSessions.find(s => s.id === sessionId);
    
    if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }
  
    // Validate user is participant (creator or friend)
    const isCreator = String(session.creatorId) === String(userId);
    const isFriend = session.friendId && String(session.friendId) === String(userId);
    const isParticipant = session.participants?.some(p => String(p.userId) === String(userId));
    
    if (!isCreator && !isFriend && !isParticipant) {
      return res.status(403).json({ error: 'You are not authorized to view messages in this session' });
    }
  }
  
  const chatFile = path.join(DATA_DIR, `study-together-chat-${sessionId}.json`);

  if (!fs.existsSync(chatFile)) {
    return res.json({ messages: [] });
  }

  try {
    const messages = safeReadJson(chatFile, []);
    res.json({ messages });
  } catch (error) {
    console.error('Error reading chat file:', error);
    res.json({ messages: [] });
  }
});

const BLACKBOARD_HISTORY_LIMIT = 50;

const getStudyTogetherSessionById = (sessionId) => {
  const allSessionsFile = path.join(DATA_DIR, 'study-together-sessions.json');
  if (!fs.existsSync(allSessionsFile)) {
    return null;
  }

  const allSessions = safeReadJson(allSessionsFile, []);
  return allSessions.find(s => String(s.id) === String(sessionId)) || null;
};

const canAccessStudyTogetherSession = (session, userId) => {
  if (!session) {
    return false;
  }

  const isCreator = String(session.creatorId) === String(userId);
  const isFriend = session.friendId && String(session.friendId) === String(userId);
  const isParticipant = session.participants?.some(p => String(p.userId) === String(userId));

  return isCreator || isFriend || isParticipant;
};

const getStudyTogetherBlackboardFile = (sessionId) => (
  path.join(DATA_DIR, `study-together-blackboard-${sessionId}.json`)
);

const normalizeStudyTogetherBlackboardData = (data, sessionId) => {
  const history = Array.isArray(data?.history) ? data.history.filter(item => typeof item === 'string') : [];
  const hasLegacyState = typeof data?.state === 'string' && data.state.length > 0;

  if (history.length === 0 && hasLegacyState) {
    history.push(data.state);
  }

  let historyIndex = Number.isInteger(data?.historyIndex) ? data.historyIndex : (history.length > 0 ? history.length - 1 : -1);
  if (history.length === 0) {
    historyIndex = -1;
  } else if (historyIndex < 0) {
    historyIndex = 0;
  } else if (historyIndex >= history.length) {
    historyIndex = history.length - 1;
  }

  const state = historyIndex >= 0 ? history[historyIndex] : null;

  return {
    sessionId: String(sessionId),
    state,
    history,
    historyIndex,
    updatedAt: data?.updatedAt || null,
    updatedBy: data?.updatedBy || null
  };
};

const readStudyTogetherBlackboardData = (sessionId) => {
  const blackboardFile = getStudyTogetherBlackboardFile(sessionId);
  if (!fs.existsSync(blackboardFile)) {
    return normalizeStudyTogetherBlackboardData({}, sessionId);
  }

  const parsed = safeReadJson(blackboardFile, {});
  return normalizeStudyTogetherBlackboardData(parsed, sessionId);
};

const writeStudyTogetherBlackboardData = (sessionId, data) => {
  const blackboardFile = getStudyTogetherBlackboardFile(sessionId);
  atomicWriteJson(blackboardFile, data);
};

// Blackboard endpoints
app.get('/api/study-together/blackboard/:sessionId', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const session = getStudyTogetherSessionById(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!canAccessStudyTogetherSession(session, userId)) {
    return res.status(403).json({ error: 'You are not authorized to access this blackboard' });
  }

  const blackboardData = readStudyTogetherBlackboardData(sessionId);
  res.json(blackboardData);
});

app.post('/api/study-together/blackboard/:sessionId', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const { state } = req.body;
  const session = getStudyTogetherSessionById(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!canAccessStudyTogetherSession(session, userId)) {
    return res.status(403).json({ error: 'You are not authorized to update this blackboard' });
  }

  if (typeof state !== 'string') {
    return res.status(400).json({ error: 'State is required' });
  }

  const blackboardData = readStudyTogetherBlackboardData(sessionId);
  const trimmedHistory = blackboardData.historyIndex < blackboardData.history.length - 1
    ? blackboardData.history.slice(0, blackboardData.historyIndex + 1)
    : [...blackboardData.history];

  if (trimmedHistory[trimmedHistory.length - 1] !== state) {
    trimmedHistory.push(state);
  }

  const history = trimmedHistory.slice(-BLACKBOARD_HISTORY_LIMIT);
  const historyIndex = history.length > 0 ? history.length - 1 : -1;
  const updatedAt = new Date().toISOString();
  const updatedBoard = {
    sessionId: String(sessionId),
    state: historyIndex >= 0 ? history[historyIndex] : null,
    history,
    historyIndex,
    updatedAt,
    updatedBy: userId
  };

  writeStudyTogetherBlackboardData(sessionId, updatedBoard);
  res.json({
    success: true,
    state: updatedBoard.state,
    updatedAt: updatedBoard.updatedAt,
    historyIndex: updatedBoard.historyIndex
  });
});

app.post('/api/study-together/blackboard/:sessionId/action', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const { action } = req.body;
  const session = getStudyTogetherSessionById(sessionId);

  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  if (!canAccessStudyTogetherSession(session, userId)) {
    return res.status(403).json({ error: 'You are not authorized to update this blackboard' });
  }

  if (action !== 'undo' && action !== 'redo') {
    return res.status(400).json({ error: 'Unsupported blackboard action' });
  }

  const blackboardData = readStudyTogetherBlackboardData(sessionId);
  if (!blackboardData.history.length) {
    return res.status(400).json({ error: 'No blackboard history available' });
  }

  if (action === 'undo' && blackboardData.historyIndex > 0) {
    blackboardData.historyIndex -= 1;
  } else if (action === 'redo' && blackboardData.historyIndex < blackboardData.history.length - 1) {
    blackboardData.historyIndex += 1;
  }

  blackboardData.state = blackboardData.history[blackboardData.historyIndex] || null;
  blackboardData.updatedAt = new Date().toISOString();
  blackboardData.updatedBy = userId;

  writeStudyTogetherBlackboardData(sessionId, blackboardData);

  res.json({
    success: true,
    state: blackboardData.state,
    updatedAt: blackboardData.updatedAt,
    historyIndex: blackboardData.historyIndex,
    canUndo: blackboardData.historyIndex > 0,
    canRedo: blackboardData.historyIndex < blackboardData.history.length - 1
  });
});

// Solo study session blackboard endpoints
app.get('/api/study-session/blackboard/:sessionId', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const blackboardFile = path.join(DATA_DIR, `study-session-blackboard-${userId}-${sessionId}.json`);

  if (!fs.existsSync(blackboardFile)) {
    return res.json({ state: null });
  }

  const blackboardData = safeReadJson(blackboardFile, {});
  res.json(blackboardData);
});

app.post('/api/study-session/blackboard/:sessionId', authenticateUser, (req, res) => {
  const userId = req.user.id;
  const { sessionId } = req.params;
  const { state } = req.body;
  
  const blackboardFile = path.join(DATA_DIR, `study-session-blackboard-${userId}-${sessionId}.json`);
  const blackboardData = {
    sessionId,
    userId,
    state,
    updatedAt: new Date().toISOString()
  };

  atomicWriteJson(blackboardFile, blackboardData);
  res.json({ success: true });
});

// Friends routes
app.get('/api/friends', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  try {
    // Fetch confirmed friends (join with users for name/email)
    const friendsResult = await db.query(
      `SELECT u.id, u.name, u.email, f.added_at
       FROM friends f
       JOIN users u ON u.id = f.friend_id
       WHERE f.user_id = $1`,
      [userId]
    );
    const friends = friendsResult.rows.map(r => ({
      id: r.id,
      name: r.name,
      email: r.email,
      addedAt: r.added_at
    }));

    // Fetch pending requests (incoming and outgoing)
    const reqResult = await db.query(
      `SELECT * FROM friend_requests
       WHERE (to_id = $1 OR from_id = $1) AND status = 'pending'`,
      [userId]
    );
    const pendingRequests = reqResult.rows.map(r => ({
      id: r.id,
      fromId: r.from_id,
      fromEmail: r.from_email,
      fromName: r.from_name,
      toId: r.to_id,
      toEmail: r.to_email,
      status: r.status,
      sentAt: r.sent_at,
      ...(r.from_id === userId ? { direction: 'outgoing' } : {})
    }));

    res.json({ friends, pendingRequests });
  } catch (err) {
    console.error('GET /api/friends error:', err);
    res.status(500).json({ error: 'Failed to fetch friends' });
  }
});

// Send friend request
app.post('/api/friends/send-request', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const { email } = req.body;

  if (!email || !email.trim()) {
    return res.status(400).json({ error: 'Email is required' });
  }

  try {
    // Find user by email in database
    const userResult = await db.query(
      'SELECT id, name, email FROM users WHERE LOWER(email) = LOWER($1)',
      [email.trim()]
    );
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User with this email not found' });
    }
    const friendUser = userResult.rows[0];
    const friendId = String(friendUser.id);

    // Can't send request to yourself
    if (friendId === userId) {
      return res.status(400).json({ error: 'You cannot send a friend request to yourself' });
    }

    // Check if already friends
    const alreadyFriend = await db.query(
      'SELECT 1 FROM friends WHERE user_id = $1 AND friend_id = $2',
      [userId, friendId]
    );
    if (alreadyFriend.rows.length > 0) {
      return res.status(400).json({ error: 'You are already friends with this user' });
    }

    // Check if a pending request already exists in either direction
    const existingReq = await db.query(
      `SELECT 1 FROM friend_requests
       WHERE status = 'pending'
         AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`,
      [userId, friendId]
    );
    if (existingReq.rows.length > 0) {
      return res.status(400).json({ error: 'Friend request already exists' });
    }

    // Create friend request
    const requestId = Date.now().toString();
    await db.query(
      `INSERT INTO friend_requests (id, from_id, from_email, from_name, to_id, to_email, status, sent_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending', NOW())`,
      [requestId, userId, req.user.email, req.user.name, friendId, friendUser.email]
    );

    res.json({ success: true, requestId });
  } catch (err) {
    console.error('POST /api/friends/send-request error:', err);
    res.status(500).json({ error: 'Failed to send friend request' });
  }
});

// Accept friend request
app.post('/api/friends/accept-request', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const { requestId } = req.body;

  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  try {
    // Find the request
    const reqResult = await db.query(
      'SELECT * FROM friend_requests WHERE id = $1 AND status = $2',
      [requestId, 'pending']
    );
    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    const request = reqResult.rows[0];

    // Verify this request is addressed to the current user
    if (String(request.to_id) !== userId) {
      return res.status(403).json({ error: 'You are not authorized to accept this request' });
    }

    const senderId = String(request.from_id);
    const now = new Date();

    // Insert both directions into friends (ignore if already exists)
    await db.query(
      `INSERT INTO friends (user_id, friend_id, added_at)
       VALUES ($1, $2, $3), ($2, $1, $3)
       ON CONFLICT DO NOTHING`,
      [userId, senderId, now]
    );

    // Mark request as accepted
    await db.query(
      'UPDATE friend_requests SET status = $1 WHERE id = $2',
      ['accepted', requestId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/friends/accept-request error:', err);
    res.status(500).json({ error: 'Failed to accept friend request' });
  }
});

// Decline friend request
app.post('/api/friends/decline-request', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const { requestId } = req.body;

  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  try {
    const reqResult = await db.query(
      'SELECT * FROM friend_requests WHERE id = $1 AND status = $2',
      [requestId, 'pending']
    );
    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Friend request not found' });
    }
    const request = reqResult.rows[0];

    if (String(request.to_id) !== userId) {
      return res.status(403).json({ error: 'You are not authorized to decline this request' });
    }

    await db.query(
      'UPDATE friend_requests SET status = $1 WHERE id = $2',
      ['declined', requestId]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/friends/decline-request error:', err);
    res.status(500).json({ error: 'Failed to decline friend request' });
  }
});

// Cancel outgoing friend request (called by the sender)
app.post('/api/friends/cancel-request', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const { requestId } = req.body;

  if (!requestId) {
    return res.status(400).json({ error: 'Request ID is required' });
  }

  try {
    const reqResult = await db.query(
      'SELECT * FROM friend_requests WHERE id = $1 AND status = $2',
      [requestId, 'pending']
    );
    if (reqResult.rows.length === 0) {
      return res.status(404).json({ error: 'Outgoing request not found' });
    }
    const request = reqResult.rows[0];

    if (String(request.from_id) !== userId) {
      return res.status(403).json({ error: 'You are not authorized to cancel this request' });
    }

    await db.query('DELETE FROM friend_requests WHERE id = $1', [requestId]);

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/friends/cancel-request error:', err);
    res.status(500).json({ error: 'Failed to cancel friend request' });
  }
});

// Remove friend
app.post('/api/friends/remove', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const { friendId } = req.body;

  if (!friendId) {
    return res.status(400).json({ error: 'Friend ID is required' });
  }

  const friendIdStr = String(friendId);

  try {
    // Remove both directions from friends table
    await db.query(
      'DELETE FROM friends WHERE (user_id = $1 AND friend_id = $2) OR (user_id = $2 AND friend_id = $1)',
      [userId, friendIdStr]
    );

    res.json({ success: true });
  } catch (err) {
    console.error('POST /api/friends/remove error:', err);
    res.status(500).json({ error: 'Failed to remove friend' });
  }
});

// Messages routes
// Helper: shape a DB row back into the legacy message object the frontend expects
const rowToMessage = (row) => ({
  id: row.id,
  senderId: row.sender_id,
  senderName: row.sender_name,
  receiverId: row.receiver_id,
  receiverName: row.receiver_name,
  message: row.message,
  timestamp: row.created_at,
  type: row.type,
  file: row.file_filename ? {
    filename: row.file_filename,
    originalName: row.file_original_name,
    mimetype: row.file_mimetype,
    size: row.file_size
  } : undefined,
  read: row.read,
  readByReceiver: row.read_by_receiver,
  readAt: row.read_at,
  deleted: row.deleted,
  deletedAt: row.deleted_at,
  edited: row.edited,
  editedAt: row.edited_at
});

// Helper: build conversations list from messages
const buildConversations = (messages, userId) => {
  const convMap = {};
  for (const m of messages) {
    const otherId = String(m.senderId) === String(userId) ? String(m.receiverId) : String(m.senderId);
    const otherName = String(m.senderId) === String(userId) ? m.receiverName : m.senderName;
    if (!convMap[otherId] || new Date(m.timestamp) > new Date(convMap[otherId].lastMessage.timestamp)) {
      convMap[otherId] = {
        friendId: otherId,
        friendName: otherName,
        lastMessage: m,
        unreadCount: 0
      };
    }
  }
  // Count unread per conversation
  for (const m of messages) {
    if (String(m.receiverId) === String(userId) && !m.read && !m.deleted) {
      const otherId = String(m.senderId);
      if (convMap[otherId]) convMap[otherId].unreadCount++;
    }
  }
  return Object.values(convMap).sort((a, b) =>
    new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp)
  );
};

app.get('/api/messages', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await db.query(
      'SELECT * FROM messages WHERE sender_id = $1 OR receiver_id = $1 ORDER BY created_at ASC',
      [userId]
    );
    const messages = result.rows.map(rowToMessage);
    res.json({ messages, conversations: buildConversations(messages, userId) });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ error: 'Failed to fetch messages' });
  }
});

app.get('/api/messages/unread-count', authenticateUser, async (req, res) => {
  try {
    const result = await db.query(
      'SELECT COUNT(*) FROM messages WHERE receiver_id = $1 AND read = false AND deleted = false',
      [req.user.id]
    );
    res.json({ unreadCount: parseInt(result.rows[0].count) });
  } catch (err) {
    console.error('Error fetching unread count:', err);
    res.status(500).json({ error: 'Failed to fetch unread count' });
  }
});

// Conversations list
app.get('/api/messages/conversations', authenticateUser, async (req, res) => {
  const userId = req.user.id;
  try {
    const result = await db.query(
      'SELECT * FROM messages WHERE sender_id = $1 OR receiver_id = $1 ORDER BY created_at ASC',
      [userId]
    );
    const messages = result.rows.map(rowToMessage);
    res.json({ conversations: buildConversations(messages, userId) });
  } catch (err) {
    console.error('Error fetching conversations:', err);
    res.status(500).json({ error: 'Failed to fetch conversations' });
  }
});

// Load conversation with a specific friend
app.get('/api/messages/conversation/:friendId', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const friendId = String(req.params.friendId);
  try {
    const result = await db.query(
      `SELECT * FROM messages
       WHERE (sender_id = $1 AND receiver_id = $2) OR (sender_id = $2 AND receiver_id = $1)
       ORDER BY created_at ASC`,
      [userId, friendId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Conversation not found' });
    }
    res.json({ conversation: result.rows.map(rowToMessage) });
  } catch (err) {
    console.error('Error fetching conversation:', err);
    res.status(500).json({ error: 'Failed to fetch conversation' });
  }
});

// Mark messages as read
app.post('/api/messages/mark-read', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const friendId = String(req.body.friendId || '');
  if (!friendId) return res.status(400).json({ error: 'friendId is required' });
  try {
    await db.query(
      `UPDATE messages SET read = true, read_by_receiver = true, read_at = NOW()
       WHERE sender_id = $1 AND receiver_id = $2 AND read = false`,
      [friendId, userId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error marking messages read:', err);
    res.status(500).json({ error: 'Failed to mark messages as read' });
  }
});

// Upload a file for messaging
app.post('/api/messages/upload-file', authenticateUser, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({
    success: true,
    file: {
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    }
  });
});

// Download a message file
app.get('/api/messages/file/:filename', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const filename = req.params.filename;
  try {
    const result = await db.query(
      'SELECT id FROM messages WHERE file_filename = $1 AND (sender_id = $2 OR receiver_id = $2)',
      [filename, userId]
    );
    if (result.rows.length === 0) {
      return res.status(403).json({ error: 'Not authorized to access this file' });
    }
    const filePath = path.join(__dirname, 'uploads', filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File not found' });
    res.sendFile(filePath);
  } catch (err) {
    console.error('Error fetching file:', err);
    res.status(500).json({ error: 'Failed to fetch file' });
  }
});

// Send a message
app.post('/api/messages/send', authenticateUser, async (req, res) => {
  const senderId = String(req.user.id);
  const senderName = req.user.name;
  const friendId = String(req.body.friendId || '');
  const text = (req.body.message || '').toString();
  const file = req.body.file || null;

  if (!friendId) return res.status(400).json({ error: 'friendId is required' });
  if (friendId === senderId) return res.status(400).json({ error: 'Cannot message yourself' });
  if (!text.trim() && !file) return res.status(400).json({ error: 'Message or file is required' });

  const receiverUser = await getUserById(friendId);
  if (!receiverUser) return res.status(404).json({ error: 'Friend not found' });

  const messageId = Date.now().toString();
  try {
    await db.query(
      `INSERT INTO messages (id, sender_id, sender_name, receiver_id, receiver_name, message, type,
        file_filename, file_original_name, file_mimetype, file_size, read, read_by_receiver)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,false,false)`,
      [
        messageId, senderId, senderName, receiverUser.id, receiverUser.name,
        text.trim(), file ? 'file' : 'text',
        file?.filename || null, file?.originalName || null,
        file?.mimetype || null, file?.size || null
      ]
    );

    // Real-time: notify receiver
    emitToUser(receiverUser.id, 'new-message', { messageId, senderId, senderName });

    res.json({ success: true, messageId });
  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// Edit a message
app.post('/api/messages/edit', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const { messageId, newMessage } = req.body;
  if (!messageId || !newMessage) return res.status(400).json({ error: 'messageId and newMessage are required' });
  try {
    const result = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    if (String(result.rows[0].sender_id) !== userId) return res.status(403).json({ error: 'You can only edit your own messages' });

    await db.query(
      'UPDATE messages SET message = $1, edited = true, edited_at = NOW() WHERE id = $2',
      [newMessage.trim(), messageId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error editing message:', err);
    res.status(500).json({ error: 'Failed to edit message' });
  }
});

// Delete a message
app.post('/api/messages/delete', authenticateUser, async (req, res) => {
  const userId = String(req.user.id);
  const { messageId } = req.body;
  if (!messageId) return res.status(400).json({ error: 'messageId is required' });
  try {
    const result = await db.query('SELECT * FROM messages WHERE id = $1', [messageId]);
    if (result.rows.length === 0) return res.status(404).json({ error: 'Message not found' });
    if (String(result.rows[0].sender_id) !== userId) return res.status(403).json({ error: 'You can only delete your own messages' });

    await db.query(
      'UPDATE messages SET deleted = true, deleted_at = NOW(), message = $1 WHERE id = $2',
      ['Message deleted', messageId]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Error deleting message:', err);
    res.status(500).json({ error: 'Failed to delete message' });
  }
});

// File upload route
app.post('/api/upload', authenticateUser, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  res.json({
    success: true,
    file: {
      filename: req.file.filename,
      originalname: req.file.originalname,
      path: `/uploads/${req.file.filename}`
    }
  });
});

// Presence tracking system
// Map: userId -> { tabs: Set of tabIds, status: 'online' | 'away' | 'offline', lastSeen: timestamp }
const userPresence = new Map();
// Map: socketId -> { userId, tabId }
const socketToUser = new Map();
// Grace period for offline detection (5 seconds)
const OFFLINE_GRACE_PERIOD = 5000;
// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

// Helper to get user's friends list
const getUserFriends = (userId) => {
  const userDataFile = `user_${userId}_friends.json`;
  const userData = readData(userDataFile) || { friends: [], pendingRequests: [] };
  return Array.isArray(userData.friends) ? userData.friends : [];
};

// Helper to check if user has showOnlineStatus enabled
const hasShowOnlineStatusEnabled = (userId) => {
  const userSettings = readData(`user_${userId}_settings`);
  // Default to true if settings don't exist (backwards compatibility)
  return userSettings?.privacy?.showOnlineStatus !== false;
};

// Helper to calculate user's presence status
const calculateUserStatus = (userId) => {
  // If user has disabled showOnlineStatus, always return offline
  if (!hasShowOnlineStatusEnabled(userId)) {
    return 'offline';
  }
  
  const presence = userPresence.get(userId);
  if (!presence || presence.tabs.size === 0) {
    return 'offline';
  }
  // Check if any tab is active
  const hasActiveTab = Array.from(presence.tabs).some(tabId => {
    const tab = presence.tabDetails?.get(tabId);
    return tab?.isActive === true;
  });
  return hasActiveTab ? 'online' : 'away';
};

// Emit to a specific user's sockets (for Study Together real-time)
const emitToUser = (userId, event, data) => {
  const presence = userPresence.get(String(userId));
  if (presence?.sockets?.size) {
    presence.sockets.forEach(socketId => {
      io.to(socketId).emit(event, data);
    });
  }
};

// Emit to multiple users
const emitToUsers = (userIds, event, data) => {
  (userIds || []).forEach(uid => emitToUser(uid, event, data));
};

// Broadcast presence update to user's friends
const broadcastPresenceUpdate = (userId, status) => {
  const friends = getUserFriends(userId);
  friends.forEach(friend => {
    const friendPresence = userPresence.get(friend.id);
    if (friendPresence && friendPresence.sockets && friendPresence.sockets.size > 0) {
      // Broadcast to all of friend's sockets
      friendPresence.sockets.forEach(socketId => {
        io.to(socketId).emit('presence-update', {
          userId,
          status
        });
      });
    }
  });
};

// Update user's presence status and broadcast
const updateUserPresence = (userId) => {
  const oldStatus = userPresence.get(userId)?.status || 'offline';
  const newStatus = calculateUserStatus(userId);
  
  const presence = userPresence.get(userId);
  if (presence) {
    presence.status = newStatus;
    presence.lastSeen = Date.now();
    
    // Always broadcast if status changed, or if showOnlineStatus was disabled (force offline)
    if (oldStatus !== newStatus) {
      broadcastPresenceUpdate(userId, newStatus);
    }
  }
};

// Clean up disconnected sockets periodically
setInterval(() => {
  const now = Date.now();
  userPresence.forEach((presence, userId) => {
    if (presence.lastSeen && (now - presence.lastSeen) > OFFLINE_GRACE_PERIOD) {
      // Check if user still has active connections
      if (presence.sockets && presence.sockets.size === 0) {
        const oldStatus = presence.status;
        presence.status = 'offline';
        presence.tabs.clear();
        if (presence.tabDetails) {
          presence.tabDetails.clear();
        }
        if (oldStatus !== 'offline') {
          broadcastPresenceUpdate(userId, 'offline');
        }
      }
    }
  });
}, 2000); // Check every 2 seconds

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('🔌 Client connected:', socket.id);

  socket.on('authenticate', ({ userId, token }) => {
    // Verify token
    const payload = verifyToken(token);
    if (!payload || String(payload.userId) !== String(userId)) {
      socket.emit('auth-error', { error: 'Invalid token' });
      return;
    }

    // Generate unique tab ID
    const tabId = `${userId}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Initialize or update user presence
    if (!userPresence.has(userId)) {
      userPresence.set(userId, {
        tabs: new Set(),
        tabDetails: new Map(),
        sockets: new Set(),
        status: 'offline',
        lastSeen: Date.now()
      });
    }
    
    const presence = userPresence.get(userId);
    presence.tabs.add(tabId);
    presence.sockets.add(socket.id);
    if (!presence.tabDetails) {
      presence.tabDetails = new Map();
    }
    presence.tabDetails.set(tabId, {
      isActive: true, // Assume active when first connecting
      socketId: socket.id
    });
    
    socketToUser.set(socket.id, { userId, tabId });
    socket.userId = userId;
    socket.tabId = tabId;
    
    // Update presence status
    updateUserPresence(userId);
    
    console.log(`✅ User ${userId} authenticated with tab ${tabId}`);
    
    // Send initial friends presence statuses
    const friends = getUserFriends(userId);
    const friendsPresence = friends.map(friend => {
      const friendPresence = userPresence.get(friend.id);
      return {
        userId: friend.id,
        status: friendPresence ? calculateUserStatus(friend.id) : 'offline'
      };
    });
    
    socket.emit('friends-presence', friendsPresence);
  });

  socket.on('presence-update', ({ isActive }) => {
    const userInfo = socketToUser.get(socket.id);
    if (!userInfo || !socket.userId) return;
    
    const userId = socket.userId;
    const tabId = socket.tabId;
    const presence = userPresence.get(userId);
    
    if (presence && presence.tabDetails) {
      const tabDetail = presence.tabDetails.get(tabId);
      if (tabDetail) {
        tabDetail.isActive = isActive;
        presence.lastSeen = Date.now();
        updateUserPresence(userId);
      }
    }
  });

  socket.on('heartbeat', () => {
    const userInfo = socketToUser.get(socket.id);
    if (!userInfo || !socket.userId) return;
    
    const userId = socket.userId;
    const presence = userPresence.get(userId);
    if (presence) {
      presence.lastSeen = Date.now();
    }
  });

  // Handle presence refresh request (e.g., when settings change)
  socket.on('refresh-presence', () => {
    const userInfo = socketToUser.get(socket.id);
    if (!userInfo || !socket.userId) return;
    
    const userId = socket.userId;
    // Update and broadcast presence status
    updateUserPresence(userId);
  });

  socket.on('disconnect', () => {
    const userInfo = socketToUser.get(socket.id);
    if (!userInfo || !socket.userId) {
      console.log('🔌 Client disconnected (not authenticated):', socket.id);
      return;
    }
    
    const userId = socket.userId;
    const tabId = socket.tabId;
    const presence = userPresence.get(userId);
    
    if (presence) {
      presence.tabs.delete(tabId);
      presence.sockets.delete(socket.id);
      if (presence.tabDetails) {
        presence.tabDetails.delete(tabId);
      }
      
      // If no more tabs, mark as offline after grace period
      if (presence.tabs.size === 0) {
        // Delay offline status to allow reconnection
        setTimeout(() => {
          const currentPresence = userPresence.get(userId);
          if (currentPresence && currentPresence.tabs.size === 0) {
            const oldStatus = currentPresence.status;
            currentPresence.status = 'offline';
            if (oldStatus !== 'offline') {
              broadcastPresenceUpdate(userId, 'offline');
            }
          }
        }, OFFLINE_GRACE_PERIOD);
      } else {
        // Still have other tabs, update status
        updateUserPresence(userId);
      }
    }
    
    socketToUser.delete(socket.id);
    console.log(`🔌 User ${userId} disconnected tab ${tabId}`);
  });
});

// Serve React frontend in production
const clientBuild = path.join(__dirname, 'public');
if (fs.existsSync(clientBuild)) {
  app.use(express.static(clientBuild));
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

// Start server
server.listen(PORT, () => {
  console.log(`🚀 StudyFocus server running on port ${PORT}`);
  console.log(`📁 Data directory: ${DATA_DIR}`);
  console.log(`🔌 Socket.IO enabled for real-time presence`);
});
