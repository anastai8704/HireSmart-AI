#!/usr/bin/env bash
# HireSmart AI - macOS / Linux setup
# -----------------------------------------------------------------------------
# The Unix equivalent of setup.ps1. See that file for the full explanation of
# why reinstalling after a git pull is necessary.
#
#   chmod +x setup.sh && ./setup.sh

set -e

echo ""
echo "HireSmart AI - setup"
echo "===================="
echo ""

if [ ! -f "client/package.json" ] || [ ! -f "server/package.json" ]; then
    echo "ERROR: run this from the HireSmart-AI folder (the one containing"
    echo "       'client' and 'server')."
    exit 1
fi

NODE_MAJOR=$(node -p "process.versions.node.split('.')[0]")
echo "Node.js version: v$(node -p 'process.versions.node')"

if [ "$NODE_MAJOR" -lt 18 ]; then
    echo "ERROR: Node.js 18 or newer is required."
    exit 1
fi

echo ""
echo "[1/3] Installing backend dependencies..."
cd server
npm install

# .env is git-ignored because it holds secrets, so a fresh clone has none.
if [ ! -f ".env" ]; then
    echo "      Creating server/.env from .env.example..."
    cp .env.example .env

    SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
    # Use a temp file so this works identically on macOS and Linux sed.
    sed "s|^JWT_SECRET=.*|JWT_SECRET=$SECRET|" .env > .env.tmp && mv .env.tmp .env

    echo "      Generated a random JWT_SECRET."
    echo "      Check MONGO_URI in server/.env before starting."
fi
cd ..

echo ""
echo "[2/3] Installing frontend dependencies..."
cd client
npm install
cd ..

echo ""
echo "[3/3] Verifying installation..."
MISSING=0
for pkg in react-router-dom axios lucide-react recharts clsx tailwind-merge; do
    if [ -d "client/node_modules/$pkg" ]; then
        echo "      OK   $pkg"
    else
        echo "      MISS $pkg"
        MISSING=1
    fi
done

if [ "$MISSING" -eq 1 ]; then
    echo ""
    echo "Some packages are still missing. Try a clean reinstall:"
    echo "  cd client && rm -rf node_modules && npm ci"
    exit 1
fi

echo ""
echo "Setup complete."
echo ""
echo "Next steps - use TWO separate terminals:"
echo ""
echo "  Terminal 1 (backend):"
echo "    cd server && npm run seed && npm run dev"
echo ""
echo "  Terminal 2 (frontend):"
echo "    cd client && npm run dev"
echo ""
echo "MongoDB must be running before 'npm run seed'."
echo ""
