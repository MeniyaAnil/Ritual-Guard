```bat
@echo off
setlocal enabledelayedexpansion
title Ritual Deploy Tool
color 0A

cls
echo.
echo  ==========================================
echo   RITUAL DEPLOY TOOL
echo  ==========================================
echo.

:: ── READ CREDENTIALS FROM config.txt ───────
:: config.txt sits next to this bat file
:: It is gitignored so your token stays safe

set "CONFIG_FILE=%~dp0config.txt"

if not exist "!CONFIG_FILE!" (
    color 0C
    echo  [ERROR] config.txt not found!
    echo.
    echo  Create a file called config.txt
    echo  next to this bat file with this content:
    echo.
    echo  GH_USER=YourGitHubUsername
    echo  GH_REPO=ritual-forecast
    echo  GH_TOKEN=YourTokenHere
    echo.
    pause & exit /b 1
)

:: Parse config.txt line by line
for /f "usebackq tokens=1,* delims==" %%A in ("!CONFIG_FILE!") do (
    if "%%A"=="GH_USER"  set "GH_USER=%%B"
    if "%%A"=="GH_REPO"  set "GH_REPO=%%B"
    if "%%A"=="GH_TOKEN" set "GH_TOKEN=%%B"
)

:: Validate all 3 are set
if "!GH_USER!"==""              ( echo [ERROR] GH_USER missing in config.txt  & pause & exit /b 1 )
if "!GH_REPO!"==""              ( echo [ERROR] GH_REPO missing in config.txt  & pause & exit /b 1 )
if "!GH_TOKEN!"==""             ( echo [ERROR] GH_TOKEN missing in config.txt & pause & exit /b 1 )
if "!GH_TOKEN!"=="YOUR_TOKEN_HERE" (
    color 0C
    echo  [ERROR] You forgot to set your real token in config.txt!
    echo  Open config.txt and replace YOUR_TOKEN_HERE
    echo  Get token: github.com/settings/tokens/new
    pause & exit /b 1
)

:: CHECK GIT
git --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  [ERROR] Git not installed!
    echo  Download: https://git-scm.com/download/win
    pause & exit /b 1
)

echo  [OK] Git found
echo  [OK] Account loaded from config.txt: !GH_USER!
echo  [OK] Repo: !GH_REPO!
echo.

:: COMMIT MESSAGE
echo  ==========================================
echo  Commit message (or press Enter for default)
echo.
set /p GIT_MSG="  Message: "
if "!GIT_MSG!"=="" set "GIT_MSG=deploy: update Ritual Forecast dApp"

:: CONFIRM
echo.
echo  ==========================================
echo  Pushing to: github.com/!GH_USER!/!GH_REPO!
echo  Message:    !GIT_MSG!
echo  ==========================================
echo.
set /p CONFIRM="  Type YES to push: "
if /i NOT "!CONFIRM!"=="YES" ( echo Cancelled. & pause & exit /b 0 )

:: SET ROOT
set "PROJECT_ROOT=%~dp0"
if "!PROJECT_ROOT:~-1!"=="\" set "PROJECT_ROOT=!PROJECT_ROOT:~0,-1!"
cd /d "!PROJECT_ROOT!"

:: FIND FRONTEND
if exist "package.json" (
    set "FRONTEND_PATH=!PROJECT_ROOT!"
    goto :do_push
)
if exist "frontend\package.json" (
    set "FRONTEND_PATH=!PROJECT_ROOT!\frontend"
    goto :do_push
)
color 0C
echo  [ERROR] Cannot find frontend folder!
echo  Place bat and config.txt inside or next to frontend folder.
pause & exit /b 1

:do_push
cd /d "!FRONTEND_PATH!"
echo.
echo  Pushing from: !FRONTEND_PATH!
echo.

:: =====================================================
:: PROTECT THESE 7 FILES FROM BEING DELETED
:: =====================================================
mkdir "__backup_keep__" >nul 2>&1

copy "10 Transaction Badge.png" "__backup_keep__\" /Y >nul 2>&1
copy "30 Days Check Badge.png" "__backup_keep__\" /Y >nul 2>&1
copy "5+ Ritual Balance Badge.png" "__backup_keep__\" /Y >nul 2>&1
copy "50 Tranasaction Badge.png" "__backup_keep__\" /Y >nul 2>&1
copy "Discord Badge.png" "__backup_keep__\" /Y >nul 2>&1
copy "Profiel.png" "__backup_keep__\" /Y >nul 2>&1
copy "Twitter Badge.png" "__backup_keep__\" /Y >nul 2>&1

echo  [1/6] Removing old .git folders...
if exist ".git" rmdir /s /q ".git" >nul 2>&1
for /d /r "." %%G in (.git) do (
    if exist "%%G" rmdir /s /q "%%G" >nul 2>&1
)
echo        Done

echo  [2/6] Cleaning build folders...
if exist ".next"               rmdir /s /q ".next"               >nul 2>&1
if exist "contracts\out"       rmdir /s /q "contracts\out"       >nul 2>&1
if exist "contracts\cache"     rmdir /s /q "contracts\cache"     >nul 2>&1
if exist "contracts\broadcast" rmdir /s /q "contracts\broadcast" >nul 2>&1
echo        Done

echo  [3/6] Writing .gitignore (hides config.txt and secrets)...
(
    echo node_modules/
    echo .next/
    echo .env
    echo .env.local
    echo .env.*.local
    echo out/
    echo dist/
    echo .DS_Store
    echo *.log
    echo .vercel
    echo config.txt
) > ".gitignore"
echo        Done

:: =====================================================
:: RESTORE PROTECTED FILES
:: =====================================================
copy "__backup_keep__\*" "." /Y >nul 2>&1
rmdir /s /q "__backup_keep__" >nul 2>&1

echo  [4/6] Initialising Git...
git init >nul 2>&1
git config user.email "deploy@ritual.app" >nul 2>&1
git config user.name "!GH_USER!" >nul 2>&1
echo        Done

echo  [5/6] Staging all files...
git add --all >nul 2>&1
echo        Done

echo  [6/6] Committing and pushing...
git commit -m "!GIT_MSG!" >nul 2>&1
git branch -M main >nul 2>&1
set "REMOTE_URL=https://!GH_TOKEN!@github.com/!GH_USER!/!GH_REPO!.git"
git remote add origin "!REMOTE_URL!" >nul 2>&1
git push -u origin main --force

if errorlevel 1 (
    color 0C
    echo.
    echo  ==========================================
    echo  PUSH FAILED
    echo  ==========================================
    echo  1. Token expired - update GH_TOKEN in config.txt
    echo     Get new token: github.com/settings/tokens/new
    echo     Tick the "repo" scope
    echo  2. Repo missing - create at: github.com/new
    echo  3. Wrong username in config.txt
    echo  ==========================================
    pause & exit /b 1
)

cls
color 0A
echo.
echo  ==========================================
echo   SUCCESS! Live on GitHub!
echo  ==========================================
echo.
echo  github.com/!GH_USER!/!GH_REPO!
echo.
echo  Vercel auto-redeploys in ~2 minutes.
echo  ==========================================
echo.
set /p OPEN_VC="  Open Vercel? (Y/N): "
if /i "!OPEN_VC!"=="Y" start https://vercel.com
echo.
pause
```

This version keeps these files safe permanently:

* 10 Transaction Badge.png
* 30 Days Check Badge.png
* 5+ Ritual Balance Badge.png
* 50 Tranasaction Badge.png
* Discord Badge.png
* Profiel.png
* Twitter Badge.png
