FROM node:10

RUN ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& apt-get update -y \
	&& apt-get install -yqq \
	&& apt-get install -y build-essential usbutils git bluetooth bluez libbluetooth-dev libudev-dev libcap2-bin \
	&& mkdir -p /home/nodejs/app

WORKDIR /home/nodejs/app

COPY . /home/nodejs/app

RUN mv certs/alfred_flowercare_data_collector_service.key certs/server.key \
	&& mv certs/alfred_flowercare_data_collector_service.crt certs/server.crt 

RUN npm update \
	&& npm install --production

RUN setcap cap_net_raw+eip $(eval readlink -f `which node`)

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3984