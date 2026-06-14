const http = require('http');
const fs = require('fs');
const path = require('path');

const API_BASE = 'http://localhost:3001/api';
const USERS_FILE = path.join(__dirname, 'server', 'data', 'users.json');

// Helper function to make HTTP requests with retry
function makeRequest(method, path, data = null, token = null, retries = 3) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      family: 4
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    let attemptsLeft = retries;
    const attemptRequest = () => {
      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : {};
            resolve({ status: res.statusCode, data: parsed });
          } catch (e) {
            resolve({ status: res.statusCode, data: body });
          }
        });
      });

      req.on('error', (error) => {
        attemptsLeft--;
        if (attemptsLeft > 0 && (error.code === 'ECONNREFUSED' || error.code === 'ECONNRESET')) {
          setTimeout(() => {
            attemptRequest();
          }, 500);
        } else {
          reject(error);
        }
      });

      if (data) {
        req.write(JSON.stringify(data));
      }
      req.end();
    };

    attemptRequest();
  });
}

// Get all existing user emails (excluding friend accounts)
function getExistingUserEmails() {
  try {
    const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const emails = usersData
      .filter(user => !user.email.includes('friend') && !user.email.includes('@test.com'))
      .map(user => user.email);
    return emails;
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

// Get the 5 friend accounts we created
function getFriendAccounts() {
  try {
    const usersData = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8'));
    const friendAccounts = usersData
      .filter(user => user.email.includes('friend') && user.email.includes('@test.com'))
      .slice(-5) // Get the last 5 friend accounts (most recent)
      .map(user => ({
        name: user.name,
        email: user.email,
        token: user.token,
        id: user.id
      }));
    return friendAccounts;
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

// Send friend request
async function sendFriendRequest(token, targetEmail) {
  const response = await makeRequest('POST', '/api/friends/send-request', {
    email: targetEmail
  }, token);

  if (response.status === 200) {
    return { success: true };
  } else {
    return { success: false, error: response.data.error || response.data };
  }
}

// Main function
async function main() {
  console.log('\n📋 Getting all existing user emails...\n');
  
  const existingEmails = getExistingUserEmails();
  const friendAccounts = getFriendAccounts();

  if (existingEmails.length === 0) {
    console.log('❌ No existing users found');
    return;
  }

  if (friendAccounts.length === 0) {
    console.log('❌ No friend accounts found. Please run create-friend-requests.js first.');
    return;
  }

  console.log(`Found ${existingEmails.length} existing user(s):`);
  existingEmails.forEach((email, idx) => {
    console.log(`   ${idx + 1}. ${email}`);
  });

  console.log(`\n📤 Sending friend requests from ${friendAccounts.length} friend accounts...\n`);

  let totalSent = 0;
  let totalFailed = 0;

  // Send friend requests from each friend account to each existing user
  for (const friend of friendAccounts) {
    console.log(`\n👤 ${friend.name} (${friend.email}):`);
    
    for (const targetEmail of existingEmails) {
      // Skip sending to self
      if (friend.email === targetEmail) {
        continue;
      }

      const result = await sendFriendRequest(friend.token, targetEmail);
      
      if (result.success) {
        console.log(`   ✓ Sent to ${targetEmail}`);
        totalSent++;
      } else {
        const errorMsg = result.error || 'Unknown error';
        // Don't show error if it's "already sent" or "already friends"
        if (!errorMsg.includes('already') && !errorMsg.includes('already friends')) {
          console.log(`   ✗ Failed to send to ${targetEmail}: ${errorMsg}`);
          totalFailed++;
        } else {
          console.log(`   ⊙ Skipped ${targetEmail} (${errorMsg})`);
        }
      }
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }

  console.log(`\n✅ Complete!`);
  console.log(`   Friend requests sent: ${totalSent}`);
  if (totalFailed > 0) {
    console.log(`   Failed: ${totalFailed}`);
  }
}

// Run the script
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

