#!/bin/bash
clear

echo "The following node processes were found and will be killed:"
export PORT=3978
lsof -i :$PORT
kill -9 $(lsof -sTCP:LISTEN -i:$PORT -t)

if [ $1 == "clean" ]
then
    echo "Remove node modules folder and package-lock"
    rm -rf node_modules
    rm package-lock.json
fi

echo "Check for module updates"
ncu -u

echo "Install updates"
npm install

echo "Check for security issues"
npm audit fix
snyk test

echo "Set env vars"
export ENVIRONMENT="development"
export MOCK="false"
export ALFRED_WEATHER_SERVICE="https://alfred_weather_service:3979"
export NO_SCHEDULE="false"
export ZONE="3"
#export DEBUG="miflora:*"

echo "Run the server"
npm run local
