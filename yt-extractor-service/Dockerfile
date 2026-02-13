FROM node:20-alpine
WORKDIR /app

# Install Python (needed by yt-dlp), ffmpeg, and build deps
RUN apk add --no-cache python3 py3-pip ffmpeg build-base

COPY package.json package-lock.json* ./
RUN npm ci

COPY . .
RUN npm run build

# Remove dev dependencies after build
RUN npm prune --production

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
