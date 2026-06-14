# StudyFocus — Setup Guide

A full-stack study productivity application built with React and Node.js.

---

## Prerequisites

| Requirement | Version | Download |
|-------------|---------|----------|
| **Node.js** | v18 or higher | https://nodejs.org |
| **npm** | v8 or higher (bundled with Node) | — |
| A modern browser | Chrome, Firefox, Edge, Safari | — |

> **Check your version:** open a terminal and run `node -v`.  
> If the number is below 18, download the latest **LTS** release from https://nodejs.org before continuing.

---

## Quick Start

### Windows

1. **Install Node.js** from https://nodejs.org if you haven't already (choose the LTS version).

2. **Open the project folder** in File Explorer, then **double-click `start.bat`**.  
   — or — open **Command Prompt / PowerShell**, navigate to the folder, and run:
   ```
   start.bat
   ```

3. **Open the app** in your browser:
   ```
   http://localhost:3000
   ```

4. **Stop the app** by pressing `Ctrl+C` in the terminal window (or just close it).

---

### macOS / Linux

1. **Open Terminal** and navigate to the project folder:
   ```bash
   cd path/to/StudyFocus
   ```

2. **Run the start script:**
   ```bash
   bash start.sh
   ```

3. **Open the app** in your browser:
   ```
   http://localhost:3000
   ```

4. **Stop the app** with `Ctrl+C`.

---

## What the start scripts do

Both `start.bat` (Windows) and `start.sh` (Mac/Linux) do the same thing automatically:

- ✅ Verify Node.js ≥ 18 is installed
- ✅ Install all dependencies on first run (skipped on subsequent runs)
- ✅ Clear the webpack build cache
- ✅ Free ports 3000 and 3001 if something is already using them
- ✅ Start the backend API server and React frontend together

---

## Manual Start (alternative)

If you prefer to run steps individually, open a terminal in the project folder:

```bash
# 1. Install dependencies (first run only)
npm install
cd client && npm install && cd ..

# 2. Start both servers
npm run dev
```

---

## Ports

| Service | URL |
|---------|-----|
| React frontend | http://localhost:3000 |
| Node.js backend API | http://localhost:3001 |

Both ports must be free before starting. The start scripts handle this automatically.

---

## AI Features

The AI-powered features (Schedule Generator, StudyFocus AI assistant, timetable extraction) use the OpenAI API. The key is pre-configured in the `.env` file included with the project — **no additional setup is needed**.

---

## Project Structure

```
StudyFocus/
├── start.bat         ← Windows launcher (double-click or run in CMD)
├── start.sh          ← macOS / Linux launcher
├── server/
│   ├── index.js      ← Express + Socket.IO backend
│   └── data/         ← JSON file storage (auto-created)
├── client/
│   └── src/
│       ├── components/
│       ├── context/
│       └── hooks/
├── nodemon.json      ← prevents restart loops on data file changes
└── package.json
```

---

## Troubleshooting

**"Port 3000 / 3001 already in use"**  
The start scripts free these ports automatically. To do it manually:

- **Windows** (run in CMD as Administrator):
  ```
  netstat -ano | findstr :3000
  taskkill /F /PID <PID shown above>
  ```
- **Mac/Linux:**
  ```bash
  lsof -ti tcp:3000 | xargs kill -9
  lsof -ti tcp:3001 | xargs kill -9
  ```

**Webpack / module-not-found errors after moving the folder**  
The webpack cache stores absolute paths. Clear it and restart:
```
# Windows
rmdir /s /q client\node_modules\.cache

# Mac/Linux
rm -rf client/node_modules/.cache
```

**App opens but data doesn't load / API calls fail**  
Make sure *both* servers started. You should see `🚀 StudyFocus server running on port 3001` in the terminal. If only the React app started, open a second terminal in the project folder and run:
```
npm run server
```

**Node.js version error**  
Download the latest LTS from https://nodejs.org, run the installer, then restart your terminal and try again.
