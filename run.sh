#!/bin/bash
clear

echo "The following node processes were found and will be killed:"
lsof -i :3978
kill -9 $(lsof -sTCP:LISTEN -i:3978 -t)

echo "Removing node modules folder and installing latest"
rm -rf node_modules
ncu -u
npm install
npm audit fix
snyk test

echo "Set env vars"
export ENVIRONMENT="development"
export MOCK="false"

echo "Run the server"
npm run local
