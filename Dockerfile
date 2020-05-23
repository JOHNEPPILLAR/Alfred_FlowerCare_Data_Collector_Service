FROM node:14-alpine

RUN ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& apk update -y \
    && mkdir -p /home/nodejs/app
    
RUN apk --no-cache --virtual build-dependencies add \
	bluez \
    git \
    g++ \
    gcc \
    libgcc \
    libstdc++ \
    linux-headers \
    make \
    python \
    && npm install --quiet node-gyp -g \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /home/nodejs/app

COPY package*.json ./

RUN npm install

COPY --chown=node:node . .

USER node

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3981
