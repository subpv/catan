# Stage 1: build the public demo that the landing page links to (/demo). It is generated, not stored in git.
FROM node:22-alpine AS demo
WORKDIR /build
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY server ./server
COPY public ./public
COPY demo ./demo
RUN node demo/build.js --public --out /build/demo-out

# Stage 2: the app
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
COPY scripts/admin.js ./scripts/admin.js
COPY public ./public
COPY --from=demo /build/demo-out ./public/demo
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/api/health || exit 1
CMD ["node", "server/index.js"]
