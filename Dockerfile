FROM node:14

ENV TZ=Europe/London

RUN mkdir -p /home/nodejs/app \
	&& apt-get update -y

RUN apt-get install -y \
	tzdata \
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
	&& npm install --quiet node-gyp -g \
	&& ln -snf /usr/share/zoneinfo/$TZ /etc/localtime \
	&& echo $TZ > /etc/timezone

WORKDIR /home/nodejs/app

COPY package*.json ./

RUN setcap cap_net_raw+eip $(eval readlink -f `which node`)

RUN npm install

COPY --chown=node:node . .

USER node

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3981