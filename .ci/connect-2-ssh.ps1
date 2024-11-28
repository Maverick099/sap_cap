# Note: Ensure you are logged in to Cloud Foundry using SSO before running this script.
# Run the following command to log in:
# cf login --sso

# Enable SSH for the application (run this if it's the first time enabling SSH)
# cf enable-ssh app-name

# Disable SSH for the application (run this after your debugging session is complete)
# cf disable-ssh app-name

# Parse command-line arguments
param (
    [string]$app = "",
    [Alias("s")]
    [string]$space = "",
    [Alias("o")]
    [string]$org = ""
)

[string]$process = "node /home/vcap/app/node_modules/.bin/cds-serve"

# Trap any errors
trap {
    Write-Host "Error: $_" -ForegroundColor Red
    exit 1
}

if (!$app -or !$space -or !$org) {
    throw "Error: All parameters (app, space, org) must be defined."
}

Write-Host "Targeting to org-$org::space-$space" -ForegroundColor Green
Write-Progress -Activity "Progress:" -Status "Targeting org and space" -PercentComplete 25
# taget the current space
cf target -o $org -s $space 

# Kill the process
Write-Host "Sending signal to allow remote debugging." -ForegroundColor Yellow
Write-Progress -Activity "Progress:" -Status "Sending signal for remote debugging" -PercentComplete 50
cf ssh $app --command 'kill -usr1 $(pgrep -f .bin/cds-serve)'

# Connect to remote tunnel
Write-Host "SSH tunnel established to $app" -ForegroundColor Cyan
Write-Progress -Activity "Progress:" -Status "Establishing SSH tunnel" -PercentComplete 100
Write-Progress -Activity "Progress:" -Completed
cf ssh $app -L 9229:127.0.0.1:9229 -N