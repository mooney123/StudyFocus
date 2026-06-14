#!/usr/bin/env bash
# ─────────────────────────────────────────────
#  StudyFocus — one-command start script
#  Usage:  bash start.sh
# ─────────────────────────────────────────────
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'

info()    { echo -e "${CYAN}[StudyFocus]${NC} $*"; }
success() { echo -e "${GREEN}[StudyFocus]${NC} $*"; }
warn()    { echo -e "${YELLOW}[StudyFocus]${NC} $*"; }
error()   { echo -e "${RED}[StudyFocus]${NC} $*"; exit 1; }

# ── 0. Prerequisites ────────────────────────────────────────────────────────
command -v node >/dev/null 2>&1 || error "Node.js not found. Install it from https://nodejs.org (v18+) and re-run."
command -v npm  >/dev/null 2>&1 || error "npm not found. It ships with Node.js — reinstall from https://nodejs.org."

NODE_MAJOR=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
if [ "$NODE_MAJOR" -lt 18 ]; then
  error "Node.js v18 or higher is required (you have v$(node -v)). Download from https://nodejs.org."
fi

# ── 1. Resolve project root ──────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"
info "Project root: $SCRIPT_DIR"

# ── 2. Install dependencies ───────────────────────────────────────────────────
if [ ! -d node_modules ]; then
  info "Installing server dependencies..."
  npm install --silent
else
  info "Server dependencies already installed — skipping."
fi

if [ ! -d client/node_modules ]; then
  info "Installing client dependencies (this may take a minute)..."
  cd client && npm install --silent && cd ..
else
  info "Client dependencies already installed — skipping."
fi

# ── 3. Clear stale webpack cache ─────────────────────────────────────────────
if [ -d client/node_modules/.cache ]; then
  info "Clearing webpack cache..."
  rm -rf client/node_modules/.cache
fi

# ── 4. Free ports if something is already bound ──────────────────────────────
free_port() {
  local PORT=$1
  local PID
  PID=$(lsof -ti tcp:"$PORT" 2>/dev/null || true)
  if [ -n "$PID" ]; then
    warn "Port $PORT is in use (PID $PID) — releasing it."
    kill -9 "$PID" 2>/dev/null || true
    sleep 1
  fi
}
free_port 3000
free_port 3001

# ── 5. Launch ────────────────────────────────────────────────────────────────
success "Starting StudyFocus..."
echo ""
echo -e "  ${GREEN}●${NC} Backend API  →  http://localhost:3001"
echo -e "  ${GREEN}●${NC} React App    →  http://localhost:3000"
echo ""
echo -e "  Press ${YELLOW}Ctrl+C${NC} to stop both servers."
echo ""

npm run dev
