FROM node:16 AS builder

## Install build toolchain
RUN mkdir -p /home/nodejs/app \
	&& apt-get update \
	&& apt-get install -y \
	build-essential \
	usbutils \
	bluetooth \
	bluez \
	libbluetooth-dev \
	libudev-dev \
	git \ 
	g++ \
	gcc \
	make \
	python \
	&& npm install --quiet node-gyp -g

## Copy package file and compile
WORKDIR /home/nodejs/app

COPY package*.json ./

RUN npm install

## Setup clean container
FROM node:16 AS app

ENV TZ=Europe/London

## Install libs
RUN mkdir -p /home/nodejs/app \
	bluetooth \
	bluez \
	libbluetooth-dev \
	libudev-dev \
	libcap2-bin \
	curl \
	tzdata \
	&& echo $TZ > /etc/timezone

WORKDIR /home/nodejs/app

## Copy pre-installed/build modules and app
COPY --from=builder /home/nodejs/app .

## Set permissions
COPY --chown=node:node . .

RUN chown -R node:node /home/nodejs/app

## Run node without root
RUN setcap cap_net_raw+eip $(eval readlink -f `which node`)

## Swap to node user
USER node

## Setup health check
HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3981