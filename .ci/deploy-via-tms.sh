#!/usr/bin/env bash
set -e # Exit immediately if a command exits with a non-zero status.

source "$(dirname "$0")/common.sh"
echo -e "Sourced common.sh\nProceeding..."

###########################################################################################
# Used to push(Queue) the mtar artifact to SAP Transport manager
# and returns the transport request id as a job output variable named 'transport_request_id'
# and action id as a job output variable named 'action_id' if the import is set to true
#
# The script uses the following arguments:
#  1. -fid or --file-id: The file id of the mtar artifact
#  2. -i or --import: The flag to import the transport request
#
# The script uses the following environment variables:
#  - TOKEN: OAuth token for authentication
#  - CTMS_TRANSPORTURL: The URL of the SAP Transport Manager
#  - NODE: The node name to which the artifact is to be uploaded
#  - CTMS_NAMEDUSER: The named user for the transport request
#
###########################################################################################

# Parse arguments
parse_args "$@"

file_upload_id=${file_id:-$fid}
if [ -z "$file_upload_id" ]; then
  echo "##vso[task.logissue type=error]Error: File id not specified. Exiting..."
fi

should_import=${import:-$i}
if [ -z "$should_import" ]; then
  echo "##[info] The MTAR will be queued but not imported. Defaulting to 'false'."
  should_import="false"
fi

# checking if all environment variables are set
echo -e "Checking if all environment variables are set..."
required_vars=("CTMS_TRANSPORTURL" "NODE" "CTMS_NAMEDUSER" "TOKEN")
check_env_vars "${required_vars[@]}"
echo -e "All environment variables are set.\nProceeding..."

# Construct JSON payload using string concatenation
JSON_PAYLOAD='{
  "nodeName": "'"$NODE"'",
  "contentType": "MTA",
  "storageType": "FILE",
  "entries": [
    {
      "uri": "'"$file_upload_id"'"
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

# Extract the HTTP status code from the last line of the response
http_code=$(echo "$node_upload_response" | tail -n1)
response_body=$(echo "$node_upload_response" | head -n -1)

# Check the HTTP status code
if [ "$http_code" -ne 200 ] || [ "$http_code" -eq 201 ]; then
  echo $response_body
  echo "##vso[task.logissue type=error]Error: The upload request to node $NODE failed with status $http_code."
else
  echo "MTAR Queued successfully...."
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

highlighted_echo "Transport Request ID: $transportRequestId"

# Set the transport request id as a job output variable
echo "##vso[task.setvariable variable=transport_request_id;isOutput=true]$transportRequestId"

# start import if required
if [ "$should_import" == "true" ]; then

  # create import payload
  import_payload='{
    "namedUser": "'"$CTMS_NAMEDUSER"'",
    "transportRequests": [ "'"$transportRequestId"'"]
    }'

  import_response=$(curl -s -w "\n%{http_code}" --location --request POST "${CTMS_TRANSPORTURL}/v2/nodes/${nodeId}/transportRequests/import" \
    --header "Content-Type: application/json" \
    --header "Authorization: Bearer ${TOKEN}" \
    --data-raw "$import_payload")

  # Extract the HTTP status code from the last line of the response
  http_code=$(echo "$import_response" | tail -n1)
  response_body=$(echo "$import_response" | head -n -1)

  # Check the HTTP status code
  if [ "$http_code" -ne 200 ] || [ "$http_code" -eq 201 ]; then
    echo $response_body
    echo "##vso[task.logissue type=error]Error: The import request to node $NODE and node id $nodeId failed with status $http_code."
  else
    echo "Successfully imported the transport request $transportRequestId to node $NODE."
    # extract action id
    action_id=$(echo "$response_body" | grep -o '"actionId":[0-9]*' | sed 's/[^0-9]*//g')
    highlighted_echo "Action ID from import: $action_id"
    # set as job output variable
    echo "##vso[task.setvariable variable=action_id;isOutput=true]$action_id"
  fi
fi
exit 0
