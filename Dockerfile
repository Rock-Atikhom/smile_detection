# syntax=docker/dockerfile:1

FROM node:22.22.2-bookworm-slim AS build

WORKDIR /app

# Copy workspace manifests first so dependency installation stays cacheable.
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/contracts/package.json packages/contracts/package.json

RUN npm ci

COPY . .

ARG VITE_BASE_PATH=/
ARG VITE_SMART_SMILE_EMAIL_MODE=demo
ARG VITE_SMART_SMILE_EMAIL_ENDPOINT=

ENV VITE_BASE_PATH=${VITE_BASE_PATH}
ENV VITE_SMART_SMILE_EMAIL_MODE=${VITE_SMART_SMILE_EMAIL_MODE}
ENV VITE_SMART_SMILE_EMAIL_ENDPOINT=${VITE_SMART_SMILE_EMAIL_ENDPOINT}

RUN npm run web:build

FROM nginx:1.27-alpine AS runtime

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1/ || exit 1
