# ── QuizForge Frontend Dockerfile ─────────────────────────────────────────────
# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files and install
COPY package.json package-lock.json* ./
RUN npm ci --silent

# Copy source and build
COPY . .

# Build args for environment variables
ARG VITE_BACKEND_URL=http://localhost:8000
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Copy built files
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx config for SPA routing
COPY nginx-spa.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -q -O /dev/null http://localhost || exit 1

CMD ["nginx", "-g", "daemon off;"]
