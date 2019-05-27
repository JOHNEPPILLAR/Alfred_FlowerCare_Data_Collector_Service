#!/bin/bash
clear
echo "The following node processes were found and will be killed:"
lsof -i :3978
kill -9 $(lsof -sTCP:LISTEN -i:3978 -t)

#echo "Removing node modules folder and installing latest"
rm -rf node_modules
ncu -u
npm update
npm install

echo "Run the server"
npm run dev