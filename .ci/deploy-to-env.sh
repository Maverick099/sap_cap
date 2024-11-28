#!/usr/bin/env bash
set -e # Exit immediately if a command exits with a non-zero status.

source "$(dirname "$0")/common.sh"

# parse args
parse_args "$@"

api_url=${api:-$a}
if [ -z "$api_url" ]; then
    echo "Error: API URL is required. set using -a or --api" >&2
    exit 1
fi

org=${org:-$o}
if [ -z "$org" ]; then
    echo "Error: Organization is required. set using -o or --org" >&2
    exit 1
fi

space=${space:-$s}
if [ -z "$space" ]; then
    echo "Error: Space is required.set using -s or --space" >&2
    exit 1
fi

# install cf tools
install_cf_tools

# set cf api url
cf api $api_url

# login using client credentials to the org and dev space
cf auth $CLIENTID $CLIENTSECRET --client-credentials


# #mtar artifact location
# mtar_location=${System_DefaultWorkingDirectory}/JE_Workflow.mtar
# # move the mtar to current directory
# mv "$mtar_location" .

# target the passed env
cf target -o $org -s $space

# deploy, pipeing 'y' to ensure any ongoing build is cancelled and ci does not fail.
# # TODO: this has to change to make sure handle new workflow naming
# echo Y | cf deploy ./JE_Workflow.mtar