FROM node:9

RUN ln -snf /usr/share/zoneinfo/Europe/London /etc/localtime && echo Europe/London > /etc/timezone \
	&& apt-get update -y \
	&& apt-get upgrade -y \
	&& apt-get install -y build-essential curl git htop man unzip wget nano \
  && apt-get install -y bluetooth bluez libbluetooth-dev libudev-dev \
	&& mkdir -p /home/nodejs/app

WORKDIR /home/nodejs/app

COPY . /home/nodejs/app

RUN npm install --production

RUN npm install pino-elasticsearch -g

CMD [ "npm", "start" ]

EXPOSE 3978