#!/usr/bin/env bash
set -e # Exit immediately if a command exits with a non-zero status.

source "$(dirname "$0")/common.sh"
echo -e "Sourced common.sh\nProceeding..."

####################################################################################################
# BTP OAuth Token Generation Script                                        
# This script is tailored for BTP OAuth token generation to accommodate credentials
# with colons (':') stored as secret variables in Azure Pipeline, which causes issues
# with the standard get_oauth_token() function in common.sh.
#
# Use this script for token generation which uses the pipeline variables CLIENTID and CLIENTSECRET.
# For other tasks, refer to the get_oauth_token() function in common.sh.
#
# The token generated here is set as a task output variable named 'OAUTH_TOKEN',
# and not as job output variable
#
# The auth url is apended with oauth/token to get the token.
#
# The script uses the following environment variables:
#  - CLIENT_ID: The client ID for the OAuth token
#  - CLIENT_SECRET: The client secret for the OAuth token
#  - AUTH_URL: The URL for the OAuth token
####################################################################################################

# check if env variables such CLIENTID and CLIENTSECRET are set
echo -e "Checking if all environment variables are set..."
required_vars=("CLIENT_ID" "CLIENT_SECRET" "AUTH_URL")
check_env_vars "${required_vars[@]}"
echo -e "All environment variables are set.\nProceeding..."

# Send a POST request to obtain the OAuth token
token_response=$(curl -s --max-time 30 -X POST -u "${CLIENT_ID}|${CLIENT_SECRET}" \
    -d "grant_type=client_credentials&response_type=token" "${AUTH_URL}/oauth/token" --write-out "\n%{http_code}")

# Split response and status code
token_body=$(echo "$token_response" | head -n1)
status_code=$(echo "$token_response" | tail -n1)

# Check HTTP status code
if [ "$status_code" -ne 200 ]; then
    echo "#vso[task.logissue type=error]Failed to get token, HTTP status code: $status_code"
    exit 1
fi

# Check if the token response is empty
if [ -z "$token_body" ]; then
    echo "#vso[task.logissue type=error]Token response is empty."
    exit 1
fi

# Extract the access token from the response without using jq
token=$(echo "$token_body" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
if [ "$token" == "null" ] || [ -z "$token" ]; then
    echo "#vso[task.logissue type=error]Failed to extract access token."
    exit 1
fi

# Set the token as an job output variable
echo "##vso[task.setvariable variable=OAUTH_TOKEN;issecret=true]${token}"

echo "OAuth token acquired."
exit 0
