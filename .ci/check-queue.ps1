#################################################################################################
# This is a script to cancel existing running builds for the same project
# and branch as the current build. This script is intended to be used as a precheck in jobs in
# a pipeline to ensure that only the latest build is running for a given
# branch and pipeline.
#
# variables set by script as job output:
# pipelineQueueIsClear: true if the current build is the latest build for the branch and pipeline
#                       false if the current build is not the latest build for the branch and pipeline
# 
# parameters:
# --cancel-non-latest or -cnl: if this parameter is passed, then the script will cancel all (not-recomeneded since not tested throughly, use with caution.)
#                              the previous builds for the same branch and pipeline as the current build.
# environment variables:
# System_TeamFoundationCollectionUri: The URL of the Azure DevOps organization. (no need to set this, it is set by the system)
# System_TeamProject: The name of the project. (no need to set this, it is set by the system)
# BUILD_SOURCEBRANCH: The source branch of the current build. (no need to set this, it is set by the system)
################################################################################################# 


# define the variables
$orgUrl = $env:SYSTEM_TEAMFOUNDATIONCOLLECTIONURI
$project = $env:SYSTEM_TEAMPROJECT
$currentBranch = $env:BUILD_SOURCEBRANCH
$api = "7.2-preview.7"

# Set $cancelNonLatest to $true if the first argument is "--cancel-non-latest" or "-cnl"
if ($args[0] -eq "--cancel-non-latest" -or $args[0] -eq "-cnl") {
   $cancelNonLatest = $true
}
else {
   $cancelNonLatest = $false
}

Write-Host "Current build id:$env:BUILD_BUILDID"

$header = @{ Authorization = "Bearer $env:SYSTEM_ACCESSTOKEN" }
$params = "?api-version=$api&statusFilter=inProgress&queryOrder=queueTimeDescending"
$buildsUrl = "$orgUrl$project/_apis/build/builds$params"

$builds = Invoke-RestMethod -Uri $buildsUrl -Method Get -Header $header

# reference for abuild object
# @{_links=; properties=; tags=System.Object[]; validationResults=System.Object[]; plans=System.Object[]; triggerInfo=; id=35049; buildNumber=20240718.10; status=inProgress; queueTime=07/18/2024 07:10:36; startTime=07/18/2024 07:10:46; url=; definition=; buildNumberRevision=10; project=; uri=vstfs:///Build/Build/35049; sourceBranch=refs/heads/feature/z4_journal_type; sourceVersion=93b09c832101def8675e3af0c11868deb5d7746f; priority=normal; reason=individualCI; requestedFor=; requestedBy=; lastChangedDate=07/18/2024 07:12:57; lastChangedBy=; orchestrationPlan=; logs=; repository=; retainedByRelease=False; triggeredByBuild=; appendCommitMessageToRunName=True}
# writw all defination names in the list
Write-Host "All builds in progress:"
foreach ($build in $builds.value) {
   Write-Host "Build ID: $($build.id), Build Number: $($build.buildNumber), Source Branch: $($build.sourceBranch), Definition Name: $($build.definition.name)"
}
# filter out values which are not of same source branch
$filteredBuilds = $builds.value.Where({ ($_.sourceBranch -eq $currentBranch) -and ($_.definition.name -eq $env:BUILD_DEFINITIONNAME) })
# get the first build
$firstBuild = $filteredBuilds[0]

# if the first build is the current build, then set the output variable to false
if ($firstBuild.id -eq $env:BUILD_BUILDID) {
   Write-Host "This is the latest build, setting the output variable to true."
   Write-Host "##vso[task.setvariable variable=pipelineQueueIsClear;isOutput=true]true"
   $isLatestRun = $true
}
else {
   Write-Host "This is not the latest build, setting the output variable to false."
   Write-Host "##vso[task.setvariable variable=pipelineQueueIsClear;isOutput=true]false"
   $isLatestRun = $false
}

# Proceed only if we need to cancel non-latest.
if ($cancelNonLatest -eq $false) {
   Write-Host "Not cancelling any previous builds."
   exit 0
}
# If this is the latest run then cancel all the previous builds
Write-Host "This is the latest build. Cancelling previous builds for $currentBranch and pipeline $env:BUILD_DEFINITIONNAME"

# Filter out the builds to cancel.
$buildsToStop = $filteredBuilds.value.Where({ $_.id -ne $env:BUILD_BUILDID })
Write-Host "Builds to stop count: $($buildsToStop.Count)"

# Cancel all the builds all previous build if this is the latest build
if ($isLatestRun -eq $true) {
   # If this is the latest build and there are no previous builds, then exit
   if ($buildsToStop.Count -eq 0) {
      Write-Host "No previous builds to cancel."
      exit 0
   }
   ForEach ($build in $buildsToStop) {
      Write-Host "Cancelling build with ID: $($build.id)"
      $build.status = "Cancelling"
      $body = $build | ConvertTo-Json -Depth 10
      $urlToCancel = "$orgUrl$project/_apis/build/builds/$($build.id)?api-version=$api" 
      Write-Host "URL to cancel build: $urlToCancel"
      Invoke-RestMethod -Uri $urlToCancel -Method Patch -ContentType application/json -Body $body -Header $header
      Write-Host "Cancelled build with ID: $($build.id)"
   }
   exit 0
}
else {
   # current build not the latest build cancel itself
   Write-Host "Cancelling the current build."
   $urlToCancel = "$orgUrl$project/_apis/build/builds/$($env:BUILD_BUILDID)?api-version=$api"
   Write-Host "URL to cancel build: $urlToCancel"
   $currentBuild = Invoke-RestMethod -Uri $urlToCancel -Method Get -Header $header
   $currentBuild.status = "Cancelling"
   $body = $currentBuild | ConvertTo-Json -Depth 10
   Invoke-RestMethod -Uri $urlToCancel -Method Patch -ContentType application/json -Body $body -Header $header
   Write-Host "Cancelled the current build."
   exit 0
}

