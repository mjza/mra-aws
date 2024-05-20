@echo off
setlocal

:: Step 1: Clean up any previous builds
echo Cleaning up previous builds...
rmdir /S /Q nodejs
del /Q sharp-layer.zip

:: Step 2: Create nodejs directory
echo Creating nodejs directory
mkdir nodejs
cd nodejs

:: Step 3: Install packages
echo Initializing a new Node.js project and installing sharp...
call npm init -y > nul
call npm install --os=linux --cpu=arm64 sharp

:: Step 4: Zip the sharp module only
echo Packaging the sharp module...
cd ..
powershell Compress-Archive -Force -Path nodejs\* -DestinationPath sharp-layer.zip

:: Step 5: Display completion message
echo Sharp module has been successfully built and packaged as sharp-layer.zip

endlocal
pause
