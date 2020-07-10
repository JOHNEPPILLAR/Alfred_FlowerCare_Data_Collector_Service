FROM node:14-alpine

ENV TZ=Europe/London

RUN mkdir -p /home/nodejs/app \
	&& apt-get update -y \
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
	&& ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& cp /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

WORKDIR /home/nodejs/app

COPY package*.json ./

RUN setcap cap_net_raw+eip $(eval readlink -f `which node`)

RUN npm install

COPY --chown=node:node . .

USER node

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3981