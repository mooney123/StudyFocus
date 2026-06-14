const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'server', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

// Subject pools for friends
const SUBJECT_POOLS = {
  friend1: ['Mathematics', 'Physics', 'Chemistry', 'Computer Science', 'Statistics'],
  friend2: ['History', 'English', 'Literature', 'Philosophy', 'Art History', 'Political Science', 'Creative Writing'],
  friend3: ['Biology', 'Chemistry', 'Physics', 'Anatomy', 'Genetics'],
  friend4: ['Economics', 'Business', 'Finance', 'Accounting', 'Marketing'],
  friend5: ['Spanish', 'French', 'German', 'Italian', 'Linguistics']
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

// Get friend accounts - include Friend 2 (friend2_*@test.com) and the 5 most recent
function getFriendAccounts() {
  try {
    const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const allFriends = usersData
      .filter(user => user.email.includes('friend') && user.email.includes('@test.com'))
      .map(user => ({
        id: user.id,
        name: user.name,
        email: user.email
      }));
    const friend2 = allFriends.find(f => f.email.match(/^friend2_/));
    const last5 = allFriends.slice(-5);
    const ids = new Set(last5.map(f => f.id));
    // Ensure Friend 2 is in the list for generation (use friend2 pool)
    if (friend2 && !ids.has(friend2.id)) {
      return [last5[0], friend2, last5[2], last5[3], last5[4]];
    }
    return last5;
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

// Get subject pool from friend email (friend1 -> friend1 pool, friend2 -> friend2 pool, etc.)
function getPoolForFriend(email) {
  const match = email.match(/^friend(\d+)/);
  const key = match ? `friend${match[1]}` : 'friend1';
  return SUBJECT_POOLS[key] || SUBJECT_POOLS.friend1;
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

// Generate study sessions for a friend
function generateStudySessions(userId, userName, friendEmail) {
  const sessions = [];
  const now = new Date();
  
  // Select subject pool based on friend email (friend2 gets 7 subjects, etc.)
  const selectedPool = getPoolForFriend(friendEmail);
  
  // Generate sessions for last 7 days
  for (let dayOffset = 6; dayOffset >= 0; dayOffset--) {
    const date = new Date(now);
    date.setDate(date.getDate() - dayOffset);
    date.setHours(0, 0, 0, 0);
    
    // Friends have 2-4 sessions per day
    const sessionsPerDay = randomInt(2, 4);
    
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
  console.log('\n📚 Generating study history for friend accounts...\n');
  
  const friends = getFriendAccounts();
  
  if (friends.length === 0) {
    console.log('❌ No friend accounts found');
    return;
  }
  
  console.log(`Found ${friends.length} friend account(s)\n`);
  
  let totalSessionsCreated = 0;
  
  // Ensure primary Friend 2 (friend2_1767707005383) gets data with 7 subjects
  const primaryFriend2 = { id: '1767707006016', name: 'Friend Two', email: 'friend2_1767707005383@test.com' };
  const friendsToGenerate = friends.some(f => f.id === primaryFriend2.id) ? friends : [...friends, primaryFriend2];

  friendsToGenerate.forEach((friend) => {
    console.log(`👤 Generating data for ${friend.name} (${friend.email})...`);
    
    const sessions = generateStudySessions(friend.id, friend.name, friend.email);
    const stats = calculateStats(sessions);
    
    // Create new structure
    const studyData = {
      title: "Study Session",
      description: "Track your study sessions and maintain focus",
      sessions: sessions,
      settings: {
        pomodoro: {
          workTime: 25,
          breakTime: 5,
          longBreakTime: 15
        },
        notifications: true
      },
      lastUpdated: new Date().toISOString(),
      userId: friend.id,
      totalSessions: stats.totalSessions,
      totalTime: stats.totalTime
    };
    
    // Write to file
    const filename = `user_${friend.id}_study-session.json`;
    const filepath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filepath, JSON.stringify(studyData, null, 2));
    
    console.log(`   ✓ Created ${sessions.length} sessions for last 7 days`);
    console.log(`   📊 Total: ${stats.totalSessions} sessions, ${stats.totalTime} minutes`);
    console.log(`   ✅ Completed: ${stats.completedSessions}/${stats.totalSessions}\n`);
    
    totalSessionsCreated += sessions.length;
  });
  
  console.log(`\n✅ Complete!`);
  console.log(`   Generated ${totalSessionsCreated} total sessions across ${friends.length} friend accounts\n`);
}

// Run the script
main();

