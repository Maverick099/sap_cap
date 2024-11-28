#!/usr/bin/env bash
set -e # Exit immediately if a command exits with a non-zero status.

source "$(dirname "$0")/common.sh"
# This script initializes the current environment with all the required tools.
# It exports DevSpace and TestSpace based on the contents of Flag.txt.
# This is an initialization that happens for each job, so it will take care, even if shared variable not read job to job.
# exports: 
# - DevSpace
# - TestSpace

# Main execution flow
check_os
check_flags_file_exists
read_flags_file
install_cf_tools

highlighted_echo "Environment Initialization Complete"