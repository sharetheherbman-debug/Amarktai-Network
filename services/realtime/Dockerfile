FROM node:20-alpine

WORKDIR /app

COPY services/realtime/package.json services/realtime/package-lock.json* ./
RUN npm install --production

COPY services/realtime/server.js ./server.js

EXPOSE 8765

HEALTHCHECK --interval=10s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:8765/health || exit 1

CMD ["node", "server.js"]
