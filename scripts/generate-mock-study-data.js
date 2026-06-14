const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'server', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Subject pools for different users (to make them different)
const SUBJECT_POOLS = {
  default: ['Mathematics', 'Physics', 'Chemistry', 'Biology', 'English', 'History', 'Computer Science'],
  tech: ['CS4297', 'CS9287', 'Algorithms', 'Data Structures', 'Web Development', 'Database Systems', 'Software Engineering'],
  science: ['Calculus', 'Linear Algebra', 'Organic Chemistry', 'Quantum Physics', 'Statistics', 'Differential Equations'],
  arts: ['Literature', 'Creative Writing', 'Art History', 'Philosophy', 'Psychology', 'Sociology'],
  business: ['Accounting', 'Economics', 'Finance', 'Marketing', 'Management', 'Business Law'],
  mixed: ['Math', 'Physics', 'CS4297', 'English', 'History', 'Chemistry', 'Biology']
};

// Session types
const SESSION_TYPES = ['short', 'pomodoro', 'medium', 'long'];
const SESSION_DURATIONS = {
  short: 15,
  pomodoro: 25,
  medium: 45,
  long: 90
};

// Notes templates
const NOTES_TEMPLATES = [
  'Review chapter 5',
  'Practice problems',
  'Study for exam',
  'Complete homework',
  'Read textbook',
  'Work on project',
  'Quiz preparation',
  'Lab work',
  'Assignment review',
  'Concept review',
  'Problem solving',
  'Notes revision'
];

// Get all user IDs (excluding friend accounts)
function getAllUserIds() {
  try {
    const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    return usersData
      .filter(user => !(user.email.includes('friend') && user.email.includes('@test.com')))
      .map(user => ({
        id: user.id,
        name: user.name,
        email: user.email
      }));
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

// Get random element from array
function randomElement(array) {
  return array[Math.floor(Math.random() * array.length)];
}

// Get random number between min and max (inclusive)
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate a random time during the day (between 8 AM and 10 PM)
function randomTimeInDay(date) {
  const hour = randomInt(8, 22);
  const minute = randomInt(0, 59);
  const newDate = new Date(date);
  newDate.setHours(hour, minute, randomInt(0, 59), randomInt(0, 999));
  return newDate;
}

// Generate study sessions for a user
function generateStudySessions(userId, userName, userIndex) {
  const sessions = [];
  const now = new Date();
  
  // Select subject pool based on user index (to make them different)
  const poolKeys = Object.keys(SUBJECT_POOLS);
  const selectedPool = SUBJECT_POOLS[poolKeys[userIndex % poolKeys.length]];
  
  // Generate sessions for last 7 days
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);
    
    // Different users have different number of sessions per day
    // User 0: 1-2 sessions, User 1: 2-3, User 2: 1-4, etc.
    const sessionsPerDay = randomInt(
      Math.max(1, userIndex % 3 + 1),
      Math.max(2, userIndex % 4 + 2)
    );
    
    // Some days might have no sessions (weekend effect for some users)
    if (dayOffset >= 5 && userIndex % 3 === 0 && Math.random() < 0.3) {
      continue; // Skip weekend for some users
    }
    
    for (let i = 0; i < sessionsPerDay; i++) {
      const sessionType = randomElement(SESSION_TYPES);
      const duration = SESSION_DURATIONS[sessionType];
      
      // Start time with some spacing between sessions
      const startTime = randomTimeInDay(date);
      if (i > 0) {
        // Add some time after previous session
        const prevSession = sessions[sessions.length - 1];
        const prevEnd = new Date(prevSession.endTime);
        startTime.setTime(prevEnd.getTime() + randomInt(30, 120) * 60 * 1000);
      }
      
      // Actual duration might be slightly different (90-110% of planned)
      const actualDuration = Math.round(duration * randomInt(90, 110) / 100);
      
      const endTime = new Date(startTime);
      endTime.setMinutes(endTime.getMinutes() + actualDuration);
      
      // Status: 85% completed, 15% stopped
      const status = Math.random() < 0.85 ? 'completed' : 'stopped';
      
      const session = {
        id: startTime.getTime().toString(),
        type: sessionType,
        duration: duration,
        startTime: startTime.toISOString(),
        status: status,
        subject: randomElement(selectedPool),
        notes: randomElement(NOTES_TEMPLATES),
        endTime: endTime.toISOString(),
        actualDuration: status === 'completed' ? actualDuration : Math.round(actualDuration * randomInt(40, 90) / 100),
        date: date.toISOString().split('T')[0] // YYYY-MM-DD format
      };
      
      sessions.push(session);
    }
  }
  
  return sessions;
}

// Calculate total statistics
function calculateStats(sessions) {
  const totalSessions = sessions.length;
  const totalTime = sessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
  const completedSessions = sessions.filter(s => s.status === 'completed').length;
  
  return {
    totalSessions,
    totalTime,
    completedSessions
  };
}

// Main function
function main() {
  console.log('\n📚 Generating mock study history for all accounts...\n');
  
  const users = getAllUserIds();
  
  if (users.length === 0) {
    console.log('❌ No users found');
    return;
  }
  
  console.log(`Found ${users.length} user(s)\n`);
  
  let totalSessionsCreated = 0;
  
  users.forEach((user, index) => {
    console.log(`👤 Generating data for ${user.name} (${user.email})...`);
    
    const sessions = generateStudySessions(user.id, user.name, index);
    const stats = calculateStats(sessions);
    
    // Read existing file or create new structure
    const filename = `user_${user.id}_study-session.json`;
    const filepath = path.join(DATA_DIR, filename);
    
    let existingData = {
      title: "Study Session",
      description: "Track your study sessions and maintain focus",
      sessions: [],
      settings: {
        pomodoro: {
          workTime: 25,
          breakTime: 5,
          longBreakTime: 15
        },
        notifications: true
      }
    };
    
    if (fs.existsSync(filepath)) {
      try {
        existingData = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      } catch (error) {
        console.log(`   ⚠️  Error reading existing file, creating new one`);
      }
    }
    
    // Merge sessions (keep existing ones that are not in last 7 days)
    const now = new Date();
    const sevenDaysAgo = new Date(now);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const oldSessions = (existingData.sessions || []).filter(session => {
      const sessionDate = new Date(session.startTime || session.date);
      return sessionDate < sevenDaysAgo;
    });
    
    // Combine old sessions with new ones
    existingData.sessions = [...oldSessions, ...sessions];
    existingData.lastUpdated = new Date().toISOString();
    existingData.userId = user.id;
    
    // Update stats
    const allStats = calculateStats(existingData.sessions);
    existingData.totalSessions = allStats.totalSessions;
    existingData.totalTime = allStats.totalTime;
    
    // Write to file
    fs.writeFileSync(filepath, JSON.stringify(existingData, null, 2));
    
    console.log(`   ✓ Created ${sessions.length} sessions for last 7 days`);
    console.log(`   📊 Total: ${stats.totalSessions} sessions, ${stats.totalTime} minutes`);
    console.log(`   ✅ Completed: ${stats.completedSessions}/${stats.totalSessions}\n`);
    
    totalSessionsCreated += sessions.length;
  });
  
  console.log(`\n✅ Complete!`);
  console.log(`   Generated ${totalSessionsCreated} total sessions across ${users.length} accounts`);
  console.log(`   Each account has unique study patterns and subjects\n`);
}

// Run the script
main();

