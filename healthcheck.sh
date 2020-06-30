#!/usr/bin/env bash

echo "Set env vars"
PORT=3981
URL=https://localhost:$PORT/ping

echo "Call url"
if [ $(curl -L --insecure $URL -o /dev/null -w '%{http_code}\n' -s) == "401" ]
then exit 0
else exit 1
fi
