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

function fixFriendDates() {
  console.log('🔧 Fixing date fields for friend accounts...\n');
  
  let totalFixed = 0;
  
  FRIEND_IDS.forEach(friendId => {
    const filepath = path.join(DATA_DIR, `user_${friendId}_study-session.json`);
    
    if (!fs.existsSync(filepath)) {
      console.log(`⚠️  File not found for friend ${friendId}`);
      return;
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(filepath, 'utf8'));
      const sessions = data.sessions || [];
      
      let fixed = 0;
      sessions.forEach(session => {
        // If session doesn't have a date field but has startTime, add it
        if (!session.date && session.startTime) {
          const date = new Date(session.startTime);
          // Use the date from startTime in YYYY-MM-DD format
          const year = date.getFullYear();
          const month = String(date.getMonth() + 1).padStart(2, '0');
          const day = String(date.getDate()).padStart(2, '0');
          session.date = `${year}-${month}-${day}`;
          fixed++;
        }
      });
      
      if (fixed > 0) {
        // Update lastUpdated
        data.lastUpdated = new Date().toISOString();
        
        // Write back to file
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
        console.log(`✓ Fixed ${fixed} sessions for friend ${friendId}`);
        totalFixed += fixed;
      } else {
        console.log(`  No fixes needed for friend ${friendId}`);
      }
    } catch (error) {
      console.error(`❌ Error processing friend ${friendId}:`, error.message);
    }
  });
  
  console.log(`\n✅ Total: Fixed ${totalFixed} sessions across ${FRIEND_IDS.length} friend accounts`);
}

fixFriendDates();

