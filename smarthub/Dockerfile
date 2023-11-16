FROM node:19.5.0-alpine

RUN mkdir -p /app/smarthub

COPY ./src /app/smarthub

WORKDIR /app/smarthub

RUN npm install

CMD ["node", "app.js"]