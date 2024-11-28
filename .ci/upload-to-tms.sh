#!/usr/bin/env bash
set -e # Exit immediately if a command exits with a non-zero status.

source "$(dirname "$0")/common.sh"
echo -e "Sourced common.sh\nProceeding..."

###########################################################################################
# This script is used to upload the mtar artifact to SAP Transport manager
# and return the upload id as a task output variable named 'file_upload_id' as a job output variable
#
# The script uses the following arguments:
#  1. -m or --mtar-name: The name of the mtar artifact file
#
# The script uses the following environment variables:
#  - TOKEN: OAuth token for authentication
#  - SYSTEM_DEFAULTWORKINGDIRECTORY: The default working directory (not needed to be set)
#  - CTMS_TRANSPORTURL: The URL of the SAP Transport Manager
###########################################################################################

# Parse arguments
parse_args "$@"

mtar_name=${mtar_name:-$m}
if [ -z "$mtar_name" ]; then
    # print all args
    echo "All args: $@"
    echo "##vso[task.logissue type=error]Error: MTAR name not specified. Exiting..."
fi

# check if env variables such CLIENTID and CLIENTSECRET are set
echo -e "Checking if all environment variables are set..."
required_vars=("TOKEN" "SYSTEM_DEFAULTWORKINGDIRECTORY" "CTMS_TRANSPORTURL")
check_env_vars "${required_vars[@]}"
echo -e "All environment variables are set.\nProceeding..."

# Correctly find and store the first file matching the pattern
file=$(find JEWorkflowBuildArtifact -name "$mtar_name.mtar" -print | head -n 1)
if [ -z "$file" ]; then
    echo "##vso[task.logissue type=error]Error:No MTAR Artifact file with name $matar_name.mtar found in JEWorkflowBuildArtifact folder."
else
    echo "File found: $file"
    # Copy the file and check for errors
    if cp "$file" "$SYSTEM_DEFAULTWORKINGDIRECTORY"; then
        echo -e "File successfully copied to working directory.\nProceeding..."
        # Extract just the file name from the path
        file=$(basename "$file")
    else
        echo "##vso[task.logissue type=error]Error: Failed to copy the file. Exiting..."
    fi
fi

# check if build artifact is present in the root folder
if ! ls "$mtar_name.mtar" 1>/dev/null 2>&1; then
    ls -a
    echo "##vso[task.logissue type=error]Error: $mtar_name.mtar does not exist in the root folder."
fi

echo -e "Starting Upload of MTAR..."
upload_response=$(curl -s -w "\n%{http_code}" --location --request POST "${CTMS_TRANSPORTURL}/v2/files/upload" \
    --header "Authorization: Bearer $TOKEN" \
    --form "file=@\"$file\"")

# Separate the HTTP status code from the response body
http_code=$(echo "$upload_response" | tail -n1)
response_body=$(echo "$upload_response" | head -n -1)

if [ "$http_code" -eq 200 ] || [ "$http_code" -eq 201 ]; then
    # Assuming the JSON response is simple and looks something like {"id": "some_id_value"}
    FILEID=$(echo "$response_body" | grep -o '"fileId":[^,]*' | awk -F':' '{ print $2 }' | tr -d ' ')
    if [ -n "$FILEID" ]; then
        echo -e "File upload complete."
        highlighted_echo "$mtar_name uploaded with file id: $FILEID."
    else
        echo $response_body
        echo "##vso[task.logissue type=error]Failed to extract File ID. Exiting..."
    fi
else
    echo "##vso[task.logissue type=error]Failed to upload file. HTTP status code: $http_code"
fi

# # set the file id as a task output variable
echo "##vso[task.setvariable variable=file_upload_id;isOutput=true]$FILEID"
exit 0
