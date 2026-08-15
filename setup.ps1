# HireSmart AI - Windows setup
# -----------------------------------------------------------------------------
# Installs dependencies for both the backend and the frontend, and creates
# server/.env from the template if it does not exist yet.
#
# WHY YOU NEED THIS
# Git does not track node_modules - it is ~200 MB of platform-specific files, so
# it lives in .gitignore. That means every time a `git pull` changes
# package.json, your local node_modules is out of date until you reinstall.
# That is exactly what causes:
#
#     Failed to resolve import "react-router-dom" ... Are they installed?
#
# Run this from the repository root in PowerShell:
#
#     .\setup.ps1
#
# If PowerShell blocks the script, run this once in the same window:
#
#     Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "HireSmart AI - setup" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan
Write-Host ""

# --- Sanity check: are we in the right folder? -------------------------------
if (-not (Test-Path "client/package.json") -or -not (Test-Path "server/package.json")) {
    Write-Host "ERROR: run this from the HireSmart-AI folder (the one containing" -ForegroundColor Red
    Write-Host "       'client' and 'server')." -ForegroundColor Red
    Write-Host "       Example:  cd D:\HireSmart-AI" -ForegroundColor Yellow
    exit 1
}

# --- Node version check ------------------------------------------------------
$nodeVersion = (node --version) -replace 'v',''
$nodeMajor = [int]($nodeVersion -split '\.')[0]

Write-Host "Node.js version: v$nodeVersion" -ForegroundColor Gray

if ($nodeMajor -lt 18) {
    Write-Host "ERROR: Node.js 18 or newer is required. Download it from nodejs.org." -ForegroundColor Red
    exit 1
}

# --- Backend -----------------------------------------------------------------
Write-Host ""
Write-Host "[1/3] Installing backend dependencies..." -ForegroundColor Cyan

Push-Location server
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Backend install failed." -ForegroundColor Red; exit 1 }

# Create .env from the template on first run. It is git-ignored because it holds
# secrets, so a fresh clone never has one.
if (-not (Test-Path ".env")) {
    Write-Host "      Creating server/.env from .env.example..." -ForegroundColor Yellow
    Copy-Item ".env.example" ".env"

    # Generate a real random JWT secret rather than leaving the placeholder.
    $secret = -join ((1..64) | ForEach-Object { '{0:x}' -f (Get-Random -Max 16) })
    (Get-Content ".env") -replace '^JWT_SECRET=.*', "JWT_SECRET=$secret" | Set-Content ".env"

    Write-Host "      Generated a random JWT_SECRET." -ForegroundColor Green
    Write-Host "      Check MONGO_URI in server/.env before starting." -ForegroundColor Yellow
}

Pop-Location

# --- Frontend ----------------------------------------------------------------
Write-Host ""
Write-Host "[2/3] Installing frontend dependencies..." -ForegroundColor Cyan

Push-Location client
npm install
if ($LASTEXITCODE -ne 0) { Pop-Location; Write-Host "Frontend install failed." -ForegroundColor Red; exit 1 }
Pop-Location

# --- Verify the packages that were missing ------------------------------------
Write-Host ""
Write-Host "[3/3] Verifying installation..." -ForegroundColor Cyan

$required = @("react-router-dom", "axios", "lucide-react", "recharts", "clsx", "tailwind-merge")
$missing = @()

foreach ($pkg in $required) {
    if (Test-Path "client/node_modules/$pkg") {
        Write-Host "      OK   $pkg" -ForegroundColor Green
    } else {
        Write-Host "      MISS $pkg" -ForegroundColor Red
        $missing += $pkg
    }
}

if ($missing.Count -gt 0) {
    Write-Host ""
    Write-Host "Some packages are still missing. Try a clean reinstall:" -ForegroundColor Red
    Write-Host "  cd client" -ForegroundColor Yellow
    Write-Host "  Remove-Item -Recurse -Force node_modules" -ForegroundColor Yellow
    Write-Host "  npm ci" -ForegroundColor Yellow
    exit 1
}

# --- Done --------------------------------------------------------------------
Write-Host ""
Write-Host "Setup complete." -ForegroundColor Green
Write-Host ""
Write-Host "Next steps - use TWO separate terminals:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Terminal 1 (backend):" -ForegroundColor White
Write-Host "    cd server" -ForegroundColor Yellow
Write-Host "    npm run seed      # once, to create demo data" -ForegroundColor Yellow
Write-Host "    npm run dev       # http://localhost:5000" -ForegroundColor Yellow
Write-Host ""
Write-Host "  Terminal 2 (frontend):" -ForegroundColor White
Write-Host "    cd client" -ForegroundColor Yellow
Write-Host "    npm run dev       # http://localhost:5173" -ForegroundColor Yellow
Write-Host ""
Write-Host "MongoDB must be running before 'npm run seed'." -ForegroundColor Gray
Write-Host ""
