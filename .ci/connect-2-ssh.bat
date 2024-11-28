@REM # Note: Ensure you are logged in to Cloud Foundry using SSO before running this script.
@REM # Run the following command to log in:
@REM # cf login --sso

@REM # Enable SSH for the application (run this if it's the first time enabling SSH)
@REM # cf enable-ssh app-name

@REM # Disable SSH for the application (run this after your debugging session is complete)
@REM # cf disable-ssh app-name

@echo off
setlocal

REM Parse command-line arguments
set "app=%~1"
set "space=%~2"
set "org=%~3"

@REM Check if all parameters are defined
if "%app%"=="" (
    echo Error: All parameters (app, space, org) must be defined.
    exit /b 1
)
if "%space%"=="" (
    echo Error: All parameters (app, space, org) must be defined.
    exit /b 1
)
if "%org%"=="" (
    echo Error: All parameters (app, space, org) must be defined.
    exit /b 1
)

echo Targeting to org-%org% space-%space%
REM Target the current space
cf target -o %org% -s %space%

echo Sending signal to allow remote debugging.
cf ssh %app% --command "kill -usr1 $(pgrep -f .bin/cds-serve)"

echo SSH tunnel established to %app%
cf ssh %app% -L 9229:127.0.0.1:9229 -N

endlocal