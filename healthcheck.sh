#!/usr/bin/env sh

set -x
set -e

node lib/healthcheck.js

exit $?