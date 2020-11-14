FROM node:15 

ENV TZ=Europe/London

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
	tzdata \
	&& npm install --quiet node-gyp -g \
	&& echo $TZ > /etc/timezone

## Install node deps and compile native add-ons
WORKDIR /home/nodejs/app

COPY package*.json ./

RUN npm install

COPY --chown=node:node . .

## Run node without root
RUN setcap cap_net_raw+eip $(eval readlink -f `which node`)

## Swap to node user
USER node

## Setup health check
HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3981