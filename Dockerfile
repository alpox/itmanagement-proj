FROM node:slim

RUN mkdir -p /usr/src/app
COPY . /usr/src/app/
WORKDIR /usr/src/app/aurelia_project/

RUN npm install -g aurelia-cli
RUN npm install
RUN au --help
RUN aurelia --help

EXPOSE 8080
ENTRYPOINT au run --watch