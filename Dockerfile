FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install --only=production

COPY . .

EXPOSE 2307

CMD ["node", "index.js"]
