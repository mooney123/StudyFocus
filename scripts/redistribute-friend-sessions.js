const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'server', 'data');

// Friend account IDs
const FRIEND_IDS = [
  '1767707005395', // Friend One
  '1767707006016', // Friend Two
  '1767707006125', // Friend Three
  '1767707006747', // Friend Four
  '1767707007367'  // Friend Five
];

function redistributeSessions() {
  console.log('🔄 Redistributing friend sessions across last 7 days...\n');
  
  const now = new Date();
  const days = [];
  // Include today and the previous 6 days (7 days total)
  for (let i = 0; i <= 6; i++) {
    const date = new Date(now);
    date.setDate(date.getDate() - (6 - i)); // 6 days ago to today
    date.setHours(0, 0, 0, 0);
    const dateStr = date.toISOString().split('T')[0];
    days.push(dateStr);
  }
  
  console.log('Target dates:', days.join(', '));
  console.log();
  
  FRIEND_IDS.forEach(friendId => {
    const filepath = path.join(DATA_DIR, `user_${friendId}_study-session.json`);
    
    if (!fs.existsSync(filepath)) {
      console.log(`⚠️  File not found for friend ${friendId}`);
      return;
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      const sessions = data.sessions || [];
      
      // Find sessions that need redistribution:
      // 1. Sessions without dates
      // 2. Sessions with dates that have too many sessions on a single day (more than 5)
      const dateCounts = {};
      sessions.forEach(s => {
        const date = s.date || 'no-date';
        dateCounts[date] = (dateCounts[date] || 0) + 1;
      });
      
      // Find dates with too many sessions (more than 5 per day is suspicious)
      const overloadedDates = Object.keys(dateCounts).filter(date => dateCounts[date] > 5);
      
      const sessionsToFix = sessions.filter(s => {
        if (!s.date) return true;
        // Redistribute if this date has too many sessions
        if (overloadedDates.includes(s.date)) return true;
        // Or if date is not in the last 7 days
        return !days.includes(s.date);
      });
      
      if (sessionsToFix.length === 0) {
        console.log(`  Friend ${friendId}: No sessions need redistribution`);
        return;
      }
      
      console.log(`Friend ${friendId}: Redistributing ${sessionsToFix.length} sessions`);
      
      // Distribute sessions evenly across the 7 days
      const sessionsPerDay = Math.ceil(sessionsToFix.length / 7);
      let dayIndex = 0;
      let sessionsInCurrentDay = 0;
      
      sessionsToFix.forEach((session, index) => {
        // Assign to current day
        session.date = days[dayIndex];
        
        // Update startTime to match the date (keep the time portion if possible)
        if (session.startTime) {
          const originalTime = new Date(session.startTime);
          const targetDate = new Date(days[dayIndex]);
          // Keep the hour and minute from original, but use the new date
          targetDate.setHours(originalTime.getHours());
          targetDate.setMinutes(originalTime.getMinutes());
          targetDate.setSeconds(originalTime.getSeconds());
          session.startTime = targetDate.toISOString();
          
          // Update endTime if it exists
          if (session.endTime) {
            const endTime = new Date(session.endTime);
            const duration = endTime - originalTime;
            const newEndTime = new Date(targetDate.getTime() + duration);
            session.endTime = newEndTime.toISOString();
          }
        }
        
        sessionsInCurrentDay++;
        
        // Move to next day if we've assigned enough sessions to this day
        if (sessionsInCurrentDay >= sessionsPerDay && dayIndex < days.length - 1) {
          dayIndex++;
          sessionsInCurrentDay = 0;
        }
      });
      
      // Update lastUpdated
      data.lastUpdated = new Date().toISOString();
      
      // Write back to file
      fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
      console.log(`  ✓ Redistributed ${sessionsToFix.length} sessions across 7 days\n`);
      
    } catch (error) {
      console.error(`❌ Error processing friend ${friendId}:`, error.message);
    }
  });
  
  console.log('✅ Redistribution complete!');
}

redistributeSessions();

