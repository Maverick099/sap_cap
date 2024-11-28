#!/usr/bin/env bash
set -e # Exit immediately if a command exits with a non-zero status.
# set -x # Print commands and their arguments as they are executed.
source "$(dirname "$0")/common.sh"
echo -e "##[command] Sourced common.sh\nProceeding..."

###################################################################################################################
# This script reads configuration from a YAML file (flags.yaml or flags.yml) and sets environment variables
# based on the content. It's designed to run during the precheck stage of CI pipelines. If the YAML file is
# missing, the script will not exit with an error; instead, it issues a warning message.
#
# Expected YAML file structure:
# global:
#   input:
#     - "foo"
#     - "bar"
#   flags: [ "-y", "-f" ]
#   sample_input:
#     -  { property1: value, property2: "value2" }
#     -  { property1: "value3", property2: 'value 4' }
#
# Example output:
# The script converts the YAML content into shell variables, making them accessible to subsequent CI stages.
# For the given YAML structure, the output will be:
# global_input_1="foo"
# global_input_2="bar"
# global_flags_1="-y"
# global_flags_2="-f"
# global_sample_input_1_property1="value"
# global_sample_input_1_property2="value2"
# global_sample_input_2_property1="value3"
# global_sample_input_2_property2="value 4"
#
# Note: The script dynamically generates variable names based on the YAML keys and indexes, facilitating
# easy access to configuration values in later stages of the CI pipeline.
#
###################################################################################################################

# parse args
parse_args "$@"

file=${file:-$f}
if [ -z "$file" ]; then
   echo "Using default value for config file path..." >&2
   file="pipeline.cfg.yml"
fi

should_fail=${should-fail:-$sf}
if [ -z "$should_fail" ]; then
   echo "CI will not fail when pipeline.cfg.yml is not found..."
   should_fail=false
fi

readarray -t parsed_fields < <(parse_yaml $file)

for item in "${parsed_fields[@]}"; do
   if [[ -n "$item" ]]; then
      # Remove leading and trailing quotes from the item
      cleanedItem=${item//\"/}

      # Check if the item contains an equal sign
      if [[ "$cleanedItem" == *"="* ]]; then
         # Extract the key by removing everything after the first '='
         key=${cleanedItem%%=*}
         # # convert all _ to . so that pipleline has easier to access
         # dot_notation_key="${key//_/.}"

         # Extract the value by removing everything up to the first '='
         value=${cleanedItem#*=}

         # Ensure the key is a valid bash variable name
         if [[ $key =~ ^[a-zA-Z_]+[a-zA-Z0-9_]*$ ]]; then
            # Declare the variable dynamically and set its value
            declare -g "$key=$value"
            # Set as task output too
            echo "##vso[task.setvariable variable=$key;isOutput=true]$value"
            # just a debug line
            echo "##[info] set variable $key"
         else
            echo "Warning: '$key' is not a valid bash variable name."
         fi
      else
         echo "Warning: '$item' does not contain an equal sign and was skipped."
      fi
   fi
done

# setting variables as current task output, which canbe used in subsequent tasks or stages
echo "##[section] All config variables set as task output successfully."
