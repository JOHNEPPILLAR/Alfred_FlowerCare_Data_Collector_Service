#!/bin/bash
clear

APP_NAME=$(jq -r .name package.json)_role
export PORT=3978

echo "The following node processes were found and will be killed:"
lsof -i :$PORT
kill -9 $(lsof -sTCP:LISTEN -i:$PORT -t)

if [ -z "$1" ] 
then
    echo "Skipping re-install"
else
    echo "Remove node modules folder and package-lock"
    rm -rf node_modules
    rm package-lock.json

    echo "Check for module updates"
    ncu -u

    echo "Install updates"
    npm install
fi

echo "Set env vars"
export ENVIRONMENT="development"
export ZONE="3"
export SERVER_NAME="Laptop"

echo "Get app vault token"
TMP_VAULT_TOKEN=$VAULT_TOKEN
vault login -address=$VAULT_URL $VAULT_TOKEN
export VAULT_TOKEN=""
VAULES=$(vault read -address=$VAULT_URL -format=json auth/approle/role/$APP_NAME/role-id)
APP_ROLE_ID=$(echo $VAULES | jq .data.role_id)
export APP_ROLE_ID=${APP_ROLE_ID:1:${#APP_ROLE_ID}-2}
VAULES=$(vault write -f --format=json -address=$VAULT_URL auth/approle/role/$APP_NAME/secret-id)
APP_TOKEN=$(echo $VAULES | jq .data.secret_id)
export APP_TOKEN=${APP_TOKEN:1:${#APP_TOKEN}-2}

export DEBUG="Flower:*"

echo "Run the server"
npm run local

export VAULT_TOKEN=$TMP_VAULT_TOKEN
