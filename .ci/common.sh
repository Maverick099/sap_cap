#!/usr/bin/env bash
set -e # Exit immediately if a command exits with a non-zero status.

# commons functions that are reused across pipeline exectution.

# Parses the arguments
parse_args() {
    # Reset in case getopts has been used previously in the shell.
    OPTIND=1

    # Loop through all the positional parameters
    while (("$#")); do
        case "$1" in
        --*=* | -*=*)
            # Extract key and value from '--key=value' or '-k=value' format
            key="${1%%=*}"    # Remove everything after the first '='
            value="${1#*=}"   # Remove everything before the first '=' including it
            key="${key#--}"   # Remove the leading '--' from the key, if present
            key="${key#-}"    # Remove the leading '-' from the key, if present
            key="${key//-/_}" # Replace hyphens with underscores in the key name
            # Dynamically create and assign variable
            declare -g "$key=$value"
            shift
            ;;
        --* | -*)
            # Handle flags without values, setting them to true
            key="${1#--}"     # Remove the leading '--' from the key, if present
            key="${key#-}"    # Remove the leading '-' from the key, if present
            key="${key//-/_}" # Replace hyphens with underscores in the key name
            # Set the flag variable to true
            declare -g "$key=true"
            shift
            ;;
        --) # end of options
            shift
            break
            ;;
        -*)
            echo "Error: Unsupported flag format $1. Use '--key=value' or '--flag'." >&2
            exit 1
            ;;
        *) # preserve positional arguments
            PARAMS="${PARAMS-} $1"
            shift
            ;;
        esac
    done
    # Set the positional arguments in their proper place
    eval set -- "$PARAMS"
}

# highlighted echo
highlighted_echo() {
    local border=("░" "▒" "▓" "█" "▓" "▒")
    local input="$1"
    local input_length=${#input}
    local total_length=50
    local border_length

    if [ $input_length -ge $total_length ]; then
        border_length=$((input_length + 2))
    else
        border_length=$total_length
    fi

    # local padding=$(( (border_length - input_length - 4) / 2 )) # Adjust padding calculation for the added '#' characters
    local border=$(printf "${border[1]}%.0s" $(seq 1 $border_length))
    # local formatted_input=$(printf '#%*s%s%*s   #' $padding '' "$input" $padding '') # Add '#' at the start and end

    # Adjust for odd lengths to ensure the input is centered
    if [ $(((border_length - input_length) % 2)) -ne 0 ]; then
        formatted_input="$formatted_input"
    fi

    echo "$border"
    echo ""
    echo "$input"
    echo ""
    echo "$border"
}

# check if env is linux.
check_os() {
    if command -v lsb_release &>/dev/null; then
        OS=$(lsb_release -si)
        if [ "$OS" = "Ubuntu" ]; then
            echo -e "Ubuntu detected as env OS. \nProceeding..."
        else
            echo "This is not Ubuntu, but it is a Linux distribution that supports lsb_release."
            exit 1
        fi
    else
        # Fallback for other Linux distributions
        if [ -f /etc/os-release ]; then
            . /etc/os-release
            OS=$NAME
            if [[ "$OS" == *"Ubuntu"* ]]; then
                echo -e "This is Ubuntu. \nProceeding..."
            else
                echo "This is $OS. Not an Ubuntu runtime."
                exit 1
            fi
        else
            echo "Could not determine the distribution, please use Ubuntu."
            exit 1
        fi
    fi
}

# Function to check if Flags.txt is present in project root.
check_flags_file_exists() {
    if [ -f "./Flag.txt" ]; then
        echo -e "Flag.txt exists in the project root. \nProceeding..."
    else
        echo "Flag.txt does not exist in the project root."
        exit 1
    fi
}

# Reads the flags file and sets an ouput, so that it can be used by other setps or jobs that depend on the current one.
read_flags_file() {
    DevSpace=$(grep -oP 'DevSpace=\K[^;]+' Flag.txt)
    TestSpace=$(grep -oP 'TestSpace=\K[^;]+' Flag.txt)

    if [ -n "$DevSpace" ]; then
        highlighted_echo "DevSpace is $DevSpace"
        # set as output variable
        echo "##vso[task.setvariable variable=DevSpace;isOutput=true]$DevSpace"
        # set as env var
        export DevSpace
    else
        echo "DevSpace is not set."
    fi

    if [ -n "$TestSpace" ]; then
        highlighted_echo "TestSpace is $TestSpace"
        # set as output variable
        echo "##vso[task.setvariable variable=TestSpace;isOutput=true]$TestSpace"
        # set env var
        export TestSpace
    else
        echo "TestSpace is not set."
    fi
}

#  install all the necessary cf tools with cf cli V8.
install_cf_tools() {
    # Add the Cloud Foundry public key to the list of trusted keys. This is necessary for apt to verify the integrity of packages downloaded from the Cloud Foundry repository.
    wget -q -O - https://packages.cloudfoundry.org/debian/cli.cloudfoundry.org.key | sudo apt-key add -

    # Add the Cloud Foundry package repository to the system's repository list. This allows apt to install and update the Cloud Foundry CLI from this repository.
    echo "deb https://packages.cloudfoundry.org/debian stable main" | sudo tee /etc/apt/sources.list.d/cloudfoundry-cli.list

    # Updating package lists
    sudo apt-get update
    echo -e "Package lists updated.\nProceeding..."

    # Installing Cloud Foundry CLI
    sudo apt-get install cf8-cli
    echo -e "Cloud Foundry CLI installed successfully.\nProceeding..."

    # Adding Cloud Foundry Community plugin repository
    cf add-plugin-repo CF-Community https://plugins.cloudfoundry.org
    echo -e "Cloud Foundry Community plugin repository added.\nProceeding..."

    # Installing the multiapps plugin
    echo y | cf install-plugin multiapps
    echo -e "Multiapps plugin installed successfully.\nProceeding..."

    # Installing the Multi-Target Application Build Tool
    npm install -g mbt
    echo -e "Multi-Target Application Build Tool installed successfully.\nProceeding..."
}

# Gets an OAuth token using client credentials flow.
#
# This function sends a POST request to the OAuth server's token endpoint
# to obtain an access token using the client credentials grant. It requires
# three arguments: client ID, client secret, and the authentication URL.
# The function outputs the access token to stdout or exits with an error
# message and a non-zero status code if the token cannot be obtained.
#
# Arguments:
#   $1 - Client ID
#   $2 - Client Secret
#   $3 - Authentication URL
#
# Outputs:
#   Writes the access token to stdout on success.
#
# Returns:
#   0 on success, non-zero on error.
get_oauth_token() {
    echo -e "Preparing to get OAuth token..."
    # Validate input arguments
    if [ -z "$1" ]; then
        echo "Error: Client ID is missing."
        return 1
    fi

    if [ -z "$2" ]; then
        echo "Error: Client Secret is missing."
        return 1
    fi

    if [ -z "$3" ]; then
        echo "Error: Auth URL is missing."
        return 1
    fi

    local client_id="$1"
    local client_secret="$2"
    local auth_url="$3"

    # Send a POST request to obtain the OAuth token
    local token_response=$(curl -s --max-time 30 -X POST -u "${client_id}:${client_secret}" \
        -d "grant_type=client_credentials&response_type=token" "${auth_url}/oauth/token" --write-out "\n%{http_code}")

    # Split response and status code
    local token_body=$(echo "$token_response" | head -n1)
    local status_code=$(echo "$token_response" | tail -n1)

    # Check HTTP status code
    if [ "$status_code" -ne 200 ]; then
        echo "Error: Failed to get token, HTTP status code: $status_code"
        return 1
    fi

    # Check if the token response is empty
    if [ -z "$token_body" ]; then
        echo "Error: Token response is empty. Exiting..."
        return 1
    fi

    # Extract the access token from the response without using jq
    local token=$(echo "$token_body" | grep -o '"access_token":"[^"]*' | cut -d'"' -f4)
    if [ "$token" == "null" ] || [ -z "$token" ]; then
        echo "Error: Failed to extract access token."
        return 1
    fi

    echo -e "OAuth token acquired\nProceeding..."
    echo "$token"
}

# Function to check required environment variables
check_env_vars() {
    local missing_vars=0
    for var in "$@"; do
        if [ -z "${!var}" ]; then
            echo "Error: Environment variable $var is not set."
            missing_vars=$((missing_vars + 1))
        fi
    done
    if [ "$missing_vars" -ne 0 ]; then
        echo "##vso[task.logissue type=error]Error: $missing_vars required environment variable(s) are missing."
        exit 1
    fi
}

# Define a function to parse YAML files
# 🙏 thanks to answer from Martin Hecht on stackoverflow  https://stackoverflow.com/questions/5014632/how-can-i-parse-a-yaml-file-from-a-linux-shell-script
function parse_yaml {
    # Define local variables for parsing
    local s='[[:space:]]*' w='[a-zA-Z0-9_]*' fs=$(echo @ | tr @ '\034')
    # Use sed to manipulate the YAML file content into a more parseable format
    manipulated_file=$(sed -ne "s|,$s\]$s\$|]|" \
        -e ":1;s|^\($s\)\($w\)$s:$s\[$s\(.*\)$s,$s\(.*\)$s\]|\1\2: [\3]\n\1  - \4|;t1" \
        -e "s|^\($s\)\($w\)$s:$s\[$s\(.*\)$s\]|\1\2:\n\1  - \3|;p" $1 |
        sed -ne "s|,$s}$s\$|}|" \
            -e ":1;s|^\($s\)-$s{$s\(.*\)$s,$s\($w\)$s:$s\(.*\)$s}|\1- {\2}\n\1  \3: \4|;t1" \
            -e "s|^\($s\)-$s{$s\(.*\)$s}|\1-\n\1  \2|;p" |
        sed -ne "s|^\($s\):|\1|" \
            -e "s|^\($s\)-$s[\"']\(.*\)[\"']$s\$|\1$fs$fs\2|p" \
            -e "s|^\($s\)-$s\(.*\)$s\$|\1$fs$fs\2|p" \
            -e "s|^\($s\)\($w\)$s:$s[\"']\(.*\)[\"']$s\$|\1$fs\2$fs\3|p" \
            -e "s|^\($s\)\($w\)$s:$s\(.*\)$s\$|\1$fs\2$fs\3|p")

    # Append awk output to the variable
    local vars_list=$(echo "$manipulated_file" | awk -F"$fs" '{
    indent = length($1)/2;
    var_name[indent] = $2;
    for (i in var_name) {if (i > indent) {delete var_name[i]; idx[i]=0}}
    if(length($2) == 0){  var_name[indent] = ++idx[indent] }
    if (length($3) > 0) {
       vn=""; 
       for (i=0; i<indent; i++) { vn = (vn)(var_name[i])("_") }
       printf "%s%s=\"%s\"|%%|", vn, var_name[indent], $3
    }
   }')

    # convert to array using |%%| as separator
    IFS='|%%|' read -ra parsed_details <<<"$vars_list"
    printf "%s\n" "${parsed_details[@]}"
}
