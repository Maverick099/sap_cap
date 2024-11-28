#!/usr/bin/env bash
set -e # Exit immediately if a command exits with a non-zero status.

source "$(dirname "$0")/common.sh"
echo -e "Sourced common.sh\nProceeding..."
# just a progress update
echo "##vso[task.setprogress value=0;]Progress"
##################################################################################
# used to push(Queue) the mtar artifact to SAP Transport manager
##################################################################################
# Main execution

# checking if all environment variables are set
echo -e "Checking if all environment variables are set..."
required_vars=("CLIENT_ID" "CLIENT_SECRET" "AUTH_URL" "CTMS_TRANSPORTURL" "CTMS_Test_NODE" "CTMS_NAMEDUSER" "System_DefaultWorkingDirectory")
check_env_vars "${required_vars[@]}"
echo -e "All environment variables are set.\nProceeding..."
# just a progress update
echo "##vso[task.setprogress value=20;]Progress"

# Correctly find and store the first file matching the pattern
file=$(find JEWorkflowBuildArtifact -name 'je_workflow_*.mtar' -print | head -n 1)
if [ -z "$file" ]; then
  highlighted_echo "No MTAR Artifact file found in JEWorkflowBuildArtifact folder."
  exit 1
else
  echo "File found: $file"
  # Copy the file and check for errors
  if cp "$file" "$System_DefaultWorkingDirectory"; then
    echo -e "File successfully copied.\nProceeding..."
    # Extract just the file name from the path
    file=$(basename "$file")
  else
    highlighted_echo "Error: Failed to copy the file. Exiting..."
    exit 1
  fi
fi

# just a progress update
echo "##vso[task.setprogress value=40;]Progress"

# check if build artifact is present in the root folder
if ! ls je_workflow_*.mtar 1>/dev/null 2>&1; then
  highlighted_echo "Error: JE_Workflow.mtar does not exist in the root folder."
  ls -a
  exit 1
fi

# Note: not using the getting Oauth token function since the credetials vairbles have ":" in them making the function call to fail.
# Call the function and capture the token
echo -e "Getting OAuth token..."
# TOKEN=$(get_oauth_token "$CLIENT_ID" "$CLIENT_SECRET" "$AUTH_URL")  || { echo "Failed to get token"; exit 1; }

# Send a POST request to obtain the OAuth token
token_response=$(curl -s --max-time 30 -X POST -u "${CLIENT_ID}|${CLIENT_SECRET}" \
  -d "grant_type=client_credentials&response_type=token" "${AUTH_URL}/oauth/token" --write-out "\n%{http_code}")

# Split response and status code
token_body=$(echo "$token_response" | head -n1)
status_code=$(echo "$token_response" | tail -n1)

# Check HTTP status code
if [ "$status_code" -ne 200 ]; then
  highlighted_echo "Error: Failed to get token, HTTP status code: $status_code"
  exit 1
fi

# Check if the token response is empty
if [ -z "$token_body" ]; then
  highlighted_echo "Error: Token response is empty. Exiting..."
  exit 1
fi

# Extract the access token from the response without using jq
token=$(echo "$token_body" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
if [ "$token" == "null" ] || [ -z "$token" ]; then
  highlighted_echo "Error: Failed to extract access token."
  exit 1
fi

echo -e "OAuth token acquired\nProceeding..."
# just a progress update
echo "##vso[task.setprogress value=60;]Progress"
TOKEN="$token"

# extract fileid
echo -e "Starting Upload of MTAR..."
response=$(curl -s -w "\n%{http_code}" --location --request POST "${CTMS_TRANSPORTURL}/v2/files/upload" \
  --header "Authorization: Bearer $TOKEN" \
  --form "file=@\"$file\"")

# Separate the HTTP status code from the response body
http_code=$(echo "$response" | tail -n1)
response_body=$(echo "$response" | head -n -1)

if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
  # Assuming the JSON response is simple and looks something like {"id": "some_id_value"}
  FILEID=$(echo "$response_body" | grep -o '"fileId":[^,]*' | awk -F':' '{ print $2 }' | tr -d ' ')
  if [ -n "$FILEID" ]; then
    echo -e "File upload complete."
    highlighted_echo "MTAR uploaded with file id: $FILEID. Proceeding..."
  else
    highlighted_echo "Failed to extract File ID. Exiting..."
    echo $response_body
    exit 1
  fi
else
  echo "File upload failed with status code: $http_code"
  exit 1
fi

# just a progress update
echo "##vso[task.setprogress value=80;]Progress"

# TODO: to use the variable from flag file in the description of the payload for node details.
# Construct JSON payload using string concatenation
JSON_PAYLOAD='{
  "nodeName": "'"$CTMS_Test_NODE"'",
  "contentType": "MTA",
  "storageType": "FILE",
  "entries": [
    {
      "uri": "'"$FILEID"'"
    }
  ],
  "description": "JE Workflow MTAR upload to Test space node",
  "namedUser": "'"$CTMS_NAMEDUSER"'"
}'

# Use the constructed JSON payload in the curl command
node_upload_response=$(curl -s -w "\n%{http_code}" --location --request POST "${CTMS_TRANSPORTURL}/v2/nodes/upload" \
  --header 'Content-Type: application/json' \
  --header "Authorization: Bearer ${TOKEN}" \
  --data-raw "$JSON_PAYLOAD")

echo "Node upload response: $node_upload_response"
# Extract the HTTP status code from the last line of the response
http_code=$(echo "$node_upload_response" | tail -n1)
response_body=$(echo "$node_upload_response" | head -n -1)

# Check the HTTP status code
if [ "$http_code" -ne 200 ] || [ "$http_code" -eq 201 ]; then
  highlighted_echo "Error: The upload request to node failed with status $HTTP_STATUS."
  echo $response_body
  exit 1
else
  echo "Upload successful."
fi

# Extract transportRequestId
transportRequestId=$(echo "$response_body" | grep -o '"transportRequestId":[^,]*' | sed 's/[^0-9]*//g')

# Extract transportRequestDescription
transportRequestDescription=$(echo "$response_body" | grep -o '"transportRequestDescription":"[^"]*' | sed 's/"transportRequestDescription":"//')

# Extract nodeId
nodeId=$(echo "$response_body" | grep -o '"nodeId":[^,]*' | sed 's/[^0-9]*//g')

# Extract nodeName
nodeName=$(echo "$response_body" | grep -o '"nodeName":"[^"]*' | sed 's/"nodeName":"//')

# Extract queueId
queueId=$(echo "$response_body" | grep -o '"queueId":[^}]*' | sed 's/[^0-9]*//g')

# Display extracted values
echo "Description: $transportRequestDescription"
echo "Node Name: $nodeName"
echo "Queue ID: $queueId"

# just a progress update
echo "##vso[task.setprogress value=100;]Progress"

highlighted_echo "Transport Request ID: $transportRequestId"
