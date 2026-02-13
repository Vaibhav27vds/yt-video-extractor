FROM node:20-alpine
WORKDIR /app

# Install build deps for native modules
RUN apk add --no-cache build-base

COPY package.json package-lock.json* ./
RUN npm ci --only=production

COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "dist/index.js"]
