#!/usr/bin/env sh

set -x
set -e

echo "Set env vars"
export ENVIRONMENT="production"

node app/server/healthcheck.js

exit $?