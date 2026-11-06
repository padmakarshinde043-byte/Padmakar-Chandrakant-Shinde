@echo off
title Auto Deploy to Firebase Hosting
echo ========================================================
echo  Maharashtra Rajya Kendrapramukh v Adhikari Mahasangh
echo  Automatic Build & Deploy to Firebase Hosting
echo ========================================================
echo.

echo [1/3] Building latest project files...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Build failed! Please check for errors above.
    pause
    exit /b %errorlevel%
)

echo.
echo [2/3] Deploying to Firebase Hosting (mh-membership)...
call firebase deploy --only hosting
if %errorlevel% neq 0 (
    echo [ERROR] Firebase deploy failed!
    pause
    exit /b %errorlevel%
)

echo.
echo ========================================================
echo [3/3] SUCCESS! Website is now LIVE on:
echo       https://mh-membership.web.app
echo ========================================================
echo.
pause
