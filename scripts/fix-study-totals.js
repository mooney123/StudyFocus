const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'server', 'data');

// Get all user study session files
function getAllUserStudySessionFiles() {
  const files = fs.readdirSync(DATA_DIR);
  return files
    .filter(file => file.startsWith('user_') && file.endsWith('_study-session.json'))
    .map(file => path.join(DATA_DIR, file));
}

function fixStudyTotals() {
  console.log('🔧 Fixing study session totals for all users...\n');
  
  const files = getAllUserStudySessionFiles();
  let totalFixed = 0;
  
  files.forEach(filepath => {
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      const sessions = data.sessions || [];
      
      // Calculate actual totals from sessions
      const actualTotalSessions = sessions.length;
      const actualTotalTime = sessions.reduce((sum, s) => sum + (s.actualDuration || 0), 0);
      
      // Check if stored totals don't match
      if (data.totalSessions !== actualTotalSessions || data.totalTime !== actualTotalTime) {
        const userId = filepath.match(/user_(\d+)_study-session\.json/)?.[1];
        console.log(`User ${userId}:`);
        console.log(`  Old: ${data.totalSessions} sessions, ${data.totalTime} minutes`);
        console.log(`  New: ${actualTotalSessions} sessions, ${actualTotalTime} minutes`);
        
        // Update totals
        data.totalSessions = actualTotalSessions;
        data.totalTime = actualTotalTime;
        data.lastUpdated = new Date().toISOString();
        
        // Write back
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`  ✓ Fixed\n`);
        totalFixed++;
      }
    } catch (error) {
      console.error(`❌ Error processing ${filepath}:`, error.message);
    }
  });
  
  console.log(`✅ Fixed ${totalFixed} user account(s)`);
}

fixStudyTotals();

