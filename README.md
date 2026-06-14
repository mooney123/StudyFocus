# StudyFocus - A Notion-like Study Management App

A modern, dark-themed study management application inspired by Notion's design, built with React and Node.js. Track your study sessions, collaborate with friends, and stay organized with integrated tools for scheduling, meal planning, and health tracking.

## ✨ Features

### 🔐 **Authentication System**
- User registration and secure login
- Session management with token-based authentication
- Personalized user profiles and data isolation

### 📚 **Study Management Tools**
- **Study Session**: Track study sessions with Pomodoro timer
- **Friends**: Connect with study buddies and send messages
- **Leaderboard**: Compete with friends on study statistics
- **Stats & Analytics**: View your study progress and trends
- **Schedule Planner**: Plan your weekly study schedule
- **Meal Planner**: Organize meals for optimal study energy
- **Sleep & Health Tracking**: Monitor sleep patterns and health metrics
- **Study Together**: Real-time synchronized study sessions with friends

### 💾 **Data Features**
- Auto-save functionality (saves after 2 seconds of inactivity)
- Real-time data synchronization
- User-specific data storage
- Persistent sessions across browser tabs

## 🚀 Quick Start Guide

### Prerequisites

Before you begin, make sure you have the following installed:

- **Node.js** (version 14 or higher) - [Download here](https://nodejs.org/)
- **npm** (comes with Node.js)

To check if you have Node.js and npm installed, open your terminal and run:
```bash
node --version
npm --version
```

### Step 1: Download and Extract

1. Download the `StudyFocus` folder
2. Extract it to your desired location (e.g., Desktop, Documents)

### Step 2: Open Terminal

- **Windows**: Open Command Prompt or PowerShell
- **Mac**: Open Terminal (Applications > Utilities > Terminal)
- **Linux**: Open Terminal

Navigate to the StudyFocus folder:
```bash
cd path/to/StudyFocus
```

For example:
```bash
cd ~/Downloads/StudyFocus
# or
cd /Users/YourName/Downloads/StudyFocus
```

### Step 3: Install Dependencies

Install all required packages for both the server and client:

```bash
npm run install-all
```

This command will:
- Install server dependencies (root directory)
- Install client dependencies (client directory)

**Note**: This may take a few minutes. Be patient!

### Step 4: Run the Application

Start both the backend server and frontend client:

```bash
npm run dev
```

You should see output indicating that:
- The server is running on port **3001**
- The React app is starting on port **3000**

### Step 5: Open in Browser

Once the application starts, open your web browser and navigate to:

```
http://localhost:3000
```

The app should now be running! 🎉

### First Time Setup

1. Click **"Sign Up"** to create a new account
2. Enter your name, email, and password (minimum 6 characters)
3. Start using the app!

## 📖 Alternative: Running Server and Client Separately

If you prefer to run the server and client in separate terminal windows:

**Terminal 1** - Start the server:
```bash
npm run server
```

**Terminal 2** - Start the client:
```bash
npm run client
```

## 🔧 Troubleshooting

### Port Already in Use

If you see an error like "Port 3000 is already in use":

**Option 1**: Stop the process using the port
```bash
# Find and kill process on port 3000 (Mac/Linux)
lsof -ti:3000 | xargs kill -9

# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

**Option 2**: Change the port in `client/package.json` (add `PORT=3001` to the start script)

### Dependencies Not Installing

If `npm run install-all` fails:

1. Try installing manually:
   ```bash
   npm install
   cd client
   npm install
   cd ..
   ```

2. Clear npm cache:
   ```bash
   npm cache clean --force
   ```

### Server Won't Start

- Make sure you're in the root `StudyFocus` directory
- Check that Node.js version is 14 or higher: `node --version`
- Ensure the `server/data` directory exists (it should be created automatically)

### Client Won't Start

- Make sure you've installed client dependencies: `cd client && npm install`
- Check for any error messages in the terminal
- Try deleting `client/node_modules` and `client/package-lock.json`, then run `npm install` again

## 📁 Project Structure

```
StudyFocus/
├── client/                 # React frontend application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── context/        # React context providers
│   │   ├── hooks/          # Custom React hooks
│   │   └── App.js          # Main App component
│   └── package.json        # Client dependencies
├── server/                 # Node.js backend server
│   ├── data/              # JSON data files (user data stored here)
│   ├── uploads/           # Uploaded files directory
│   └── index.js           # Express server entry point
├── package.json           # Root package.json with scripts
└── README.md             # This file
```

## 🌐 Application URLs

- **Frontend (Client)**: http://localhost:3000
- **Backend (Server)**: http://localhost:3001
- **Health Check**: http://localhost:3001/api/health

## 🛑 Stopping the Application

To stop the running application:

1. In the terminal where `npm run dev` is running, press:
   - **Ctrl + C** (Windows/Linux)
   - **Cmd + C** (Mac)

2. Press it again if needed to force stop

## 📝 Available Scripts

- `npm run dev` - Start both server and client concurrently
- `npm run server` - Start only the backend server
- `npm run client` - Start only the frontend client
- `npm run install-all` - Install dependencies for both server and client
- `npm run build` - Build the React app for production

## 🔐 Data Storage

User data is stored in JSON files in the `server/data/` directory:
- Each user has their own data files
- Data is automatically created when users sign up
- All data persists between sessions

## 🎨 Tech Stack

- **Frontend**: React 19.1.1
- **Backend**: Node.js with Express
- **Real-time**: Socket.IO for live updates and presence
- **Storage**: JSON files (easily upgradeable to a database)
- **Styling**: Custom CSS with dark theme

## 🤝 Need Help?

If you encounter any issues:

1. Check that all prerequisites are installed
2. Make sure you've run `npm run install-all`
3. Check the terminal for error messages
4. Verify both ports 3000 and 3001 are available

## 📄 License

MIT License - feel free to use and modify as needed.

---

**Enjoy studying with StudyFocus! 📚✨**
