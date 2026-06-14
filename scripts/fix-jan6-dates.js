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

function fixJan6Dates() {
  console.log('🔧 Fixing date fields to match actual startTime dates...\n');
  
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
        if (session.startTime) {
          // Get the actual date from startTime
          const dateFromStartTime = new Date(session.startTime);
          const year = dateFromStartTime.getFullYear();
          const month = String(dateFromStartTime.getMonth() + 1).padStart(2, '0');
          const day = String(dateFromStartTime.getDate()).padStart(2, '0');
          const correctDate = `${year}-${month}-${day}`;
          
          // Update date field to match startTime
          if (session.date !== correctDate) {
            session.date = correctDate;
            fixed++;
          }
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

fixJan6Dates();

