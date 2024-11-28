#!/usr/bin/env bash

# Note: Ensure you are logged in to Cloud Foundry using SSO before running this script.
# Run the following command to log in:
# cf login --sso

# Enable SSH for the application (run this if it's the first time enabling SSH)
# cf enable-ssh app-name

# Disable SSH for the application (run this after your debugging session is complete)
# cf disable-ssh app-name

# app to connect to 
app=""
#  space to target
space=""
#  organization to target
org=""


# Loop through all the positional parameters
while (("$#")); do
    case "$1" in
    --app | -a)
        app="$2"
        shift 2
        ;;
    --space | -s)
        space="$2"
        shift 2
        ;;
    --org | -o)
        org="$2"
        shift 2
        ;;
    --) # end argument parsing
        shift
        break
        ;;
    -* | --*=) # unsupported flags
        echo "Error: Unsupported flag $1" >&2
        exit 1
        ;;
    *) # preserve positional arguments
        PARAMS="$PARAMS $1"
        shift
        ;;
    esac
done

# Check if all parameters are defined
if [ -z "$app" ] || [ -z "$space" ] || [ -z "$org" ]; then
    echo "Error: All parameters (app, space, org) must be defined."
    exit 1
fi

echo -ne "Progress: [=>         ]\r"
echo -ne "Targeting to org-$org::space-$space\r"

# target the current space
cf target -o $org -s $space 

echo -ne "Progress: [=====>     ]\r"
echo -ne "Sending signal to allow remote debugging.\r"

# Kill the process
cf ssh $app --command 'kill -usr1 $(pgrep -f .bin/cds-serve)'

echo -ne "Progress: [===========]\r"
echo -ne "SSH tunnel established to $app\r"
# Connect to remote tunnel
cf ssh $app -L 9229:127.0.0.1:9229 -N
