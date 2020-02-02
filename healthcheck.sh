#!/usr/bin/env sh

set -x
set -e

echo "Set env vars"
export ENVIRONMENT="production"
export PORT=3981

node app/server/healthcheck.js

exit $?