const http = require('http');

const API_BASE = 'http://localhost:3001/api';
const TARGET_EMAIL = process.argv[2] || 'mooneyfounas@gmail.com';

// Helper function to make HTTP requests with retry
function makeRequest(method, path, data = null, token = null, retries = 3) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1', // Use IPv4 explicitly
      port: 3001,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      family: 4 // Force IPv4
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
          console.log(`Retrying request (${attemptsLeft} attempts left)...`);
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

// Create a new user account
async function createAccount(name, email, password) {
  console.log(`Creating account: ${name} (${email})...`);
  const response = await makeRequest('POST', '/api/auth/signup', {
    name,
    email,
    password
  });

  if (response.status === 201) {
    console.log(`✓ Account created: ${name}`);
    return response.data;
  } else {
    console.error(`✗ Failed to create account ${name}:`, response.data.error || response.data);
    return null;
  }
}

// Send friend request
async function sendFriendRequest(token, targetEmail) {
  const response = await makeRequest('POST', '/api/friends/send-request', {
    email: targetEmail
  }, token);

  if (response.status === 200) {
    console.log(`✓ Friend request sent to ${targetEmail}`);
    return true;
  } else {
    console.error(`✗ Failed to send friend request:`, response.data.error || response.data);
    return false;
  }
}

// Main function
async function main() {
  console.log(`\n🎯 Target email: ${TARGET_EMAIL}\n`);
  console.log('Creating 5 new accounts and sending friend requests...\n');

  const accounts = [
    { name: 'Friend One', email: `friend1_${Date.now()}@test.com`, password: 'password123' },
    { name: 'Friend Two', email: `friend2_${Date.now()}@test.com`, password: 'password123' },
    { name: 'Friend Three', email: `friend3_${Date.now()}@test.com`, password: 'password123' },
    { name: 'Friend Four', email: `friend4_${Date.now()}@test.com`, password: 'password123' },
    { name: 'Friend Five', email: `friend5_${Date.now()}@test.com`, password: 'password123' }
  ];

  const createdAccounts = [];

  // Create all accounts
  for (const account of accounts) {
    const result = await createAccount(account.name, account.email, account.password);
    if (result) {
      createdAccounts.push({
        ...account,
        token: result.token,
        userId: result.user.id
      });
    }
    // Small delay to avoid overwhelming the server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n✓ Created ${createdAccounts.length} accounts\n`);
  console.log('Sending friend requests...\n');

  // Send friend requests from each account
  let successCount = 0;
  for (const account of createdAccounts) {
    const success = await sendFriendRequest(account.token, TARGET_EMAIL);
    if (success) {
      successCount++;
    }
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n✅ Complete!`);
  console.log(`   Created: ${createdAccounts.length} accounts`);
  console.log(`   Friend requests sent: ${successCount}/${createdAccounts.length}`);
  console.log(`\n📧 Accounts created:`);
  createdAccounts.forEach((acc, idx) => {
    console.log(`   ${idx + 1}. ${acc.name} - ${acc.email}`);
  });
}

// Run the script
main().catch(error => {
  console.error('Error:', error);
  process.exit(1);
});

