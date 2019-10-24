#!/usr/bin/env sh

set -x
set -e

node app/server/healthcheck.js

exit $?