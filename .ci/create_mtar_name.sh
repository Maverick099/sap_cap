#!/usr/bin/env bash
set -e # Exit immediately if a command exits with a non-zero status.
# set -x # Print commands and their arguments as they are executed.
source "$(dirname "$0")/common.sh"
echo "##[command] Sourced common.sh. Proceeding..."

####################################################################################################
# Script to generate the name of the MTAR artifact based on the app version and build ID.
# The script reads the app version and ID from the mta.yaml file if the use_version flag is set to true.
# The script sets the generated name as a task output variable named 'mtarName'.
# The script also logs the generated name to the console.
#
# The script uses the following arguments:
#  1. -n or --name: The name of the MTAR artifact
#  2. -uv or --use-version: Flag to use the app version from mta.yaml for the MTAR name
#  3. -bn or --use-curr-build-no: Flag to append the current build number to the MTAR name
#
# The script uses the following environment variables:
#  - MTAFILEPATH: The path to the mta.yaml file
#  - BUILD_BUILDID: The current build ID
####################################################################################################

# Initialize variables
app_version=""
build_id="${BUILD_BUILDID:-}" # Default to empty if not set

# Parse arguments
parse_args "$@"

name=${name:-$n}
if [ -z "$name" ]; then
    echo "##[warning] No name specified; attempting to use the ID from mta.yaml as the MTAR name."
fi

use_version=${use_version:-$uv}
if [ -z "$use_version" ]; then
    echo "##[info] Version from mta.yaml will not be used for generating the MTAR name. Defaulting to 'false'."
    use_version="false"
fi

use_curr_build_no=${use_curr_build_no:-$bn}
if [ -z "$use_curr_build_no" ]; then
    echo "##[info] The current build number will not be appended to the MTAR name. Defaulting to 'false'."
    use_curr_build_no="false"
fi

# Ensure defaults for variables that might not be set
use_version=${use_version:-"false"}
use_curr_build_no=${use_curr_build_no:-"false"}
name=${name:-"▓▒NA▒▓"}

# Check if either use_version is true or name is the placeholder
if [[ "$use_version" == "true" ]] || [[ "$name" == "▓▒NA▒▓" ]]; then
    echo "Reading mta.yaml file for app details."
    mta_file_path=${MTAFILEPATH:-"mta.yaml"}

    # Check if the MTA file exists
    if [ ! -f "$mta_file_path" ]; then
        echo "##vso[task.logissue type=error] The specified MTA file does not exist: $mta_file_path"
        exit 1
    fi

    # Extract version if use_version is true
    if [[ "$use_version" == "true" ]]; then
        app_version=$(grep '^version:' "$mta_file_path" | head -n 1 | cut -d ':' -f 2 | xargs)
        if [ -n "$app_version" ]; then
            echo "##[info] Version found: $app_version"
        else
            echo "##[warning] Version not found in $mta_file_path"
        fi
    fi

    # Extract ID if name is the placeholder
    if [[ "$name" == "▓▒NA▒▓" ]]; then
        name=$(grep '^ID:' "$mta_file_path" | head -n 1 | cut -d ':' -f 2 | xargs)
        if [ -n "$name" ]; then
            echo "ID found for name: $name"
        else
            echo "##vso[task.logissue type=error] ID not found in $mta_file_path"
            exit 1
        fi
    fi
fi

# Concatenate name, app_version, and build_id
build_name="$name"
if [[ -n "$app_version" && -n "$build_id" ]]; then
    build_name+="_${app_version}_${build_id}"
elif [[ -n "$app_version" ]]; then
    build_name+="_${app_version}"
elif [[ -n "$build_id" ]]; then
    build_name+="_${build_id}"
fi
# Export as a task variable in Azure DevOps
echo "##vso[task.setvariable variable=mtarName;isOutput=true]$build_name"
echo "Mtar name set as task variable [mtarName]: $build_name"
