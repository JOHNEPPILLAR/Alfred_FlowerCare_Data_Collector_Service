FROM node:14 AS builder

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
	libcap2-bin \
	git \ 
	g++ \
	gcc \
	libstdc++ \
	make \
	python \
	curl \
	&& npm install --quiet node-gyp -g

## Install node deps and compile native add-ons
WORKDIR /home/nodejs/app

COPY package*.json ./

RUN npm install

## Setup clean small container
FROM node:14 AS app

ENV TZ=Europe/London

RUN mkdir -p /home/nodejs/app \
	&& apt-get update \
	&& apt-get install -y \
	tzdata \
	curl \
	usbutils \
	bluetooth \
	bluez \
	libbluetooth-dev \
	libudev-dev \
	libcap2-bin \
	&& echo $TZ > /etc/timezone

WORKDIR /home/nodejs/app

## Copy pre-installed/build modules and app
COPY --from=builder /home/nodejs/app .
COPY --chown=node:node . .

## Run node without root
RUN setcap cap_net_raw+eip $(eval readlink -f `which node`)

## Swap to node user
USER node

## Setup health check
HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3981