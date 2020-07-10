FROM node:14-alpine

ENV TZ=Europe/London

RUN mkdir -p /home/nodejs/app \
	&& apk --no-cache --virtual build-dependencies --update add \
	tzdata \
	git \ 
	g++ \
	gcc \
	libgcc \
	libstdc++ \
	linux-headers \
	make \
	python \
	curl \
	&& npm install --quiet node-gyp -g \
	&& cp /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
	&& apk del tzdata \
	&& rm -rf /var/cache/apk/*

WORKDIR /home/nodejs/app

COPY package*.json ./

RUN setcap cap_net_raw+eip $(eval readlink -f `which node`)

RUN npm install

COPY --chown=node:node . .

USER node

HEALTHCHECK --start-period=60s --interval=10s --timeout=10s --retries=6 CMD ["./healthcheck.sh"]

EXPOSE 3981