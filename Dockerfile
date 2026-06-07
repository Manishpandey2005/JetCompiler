# ─── Stage 1: Build the C compiler ─────────────────────────────
FROM gcc:latest AS builder

WORKDIR /app
COPY src/ src/
COPY makefile .

# Build release binary (no readline for headless, no native fn for security)
RUN make BUILD=release NOREADLINE=1 NONATIVEFN=1 ECHO=echo

# ─── Stage 2: Node.js runtime ──────────────────────────────────
FROM node:20-slim

WORKDIR /app

# Copy the compiled binary
COPY --from=builder /app/build/release/bin/basicjit /app/bin/basicjit
RUN chmod +x /app/bin/basicjit

# Copy frontend
COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR /app/frontend
RUN npm ci --production

COPY frontend/ ./
COPY demo_features.basic /app/demo_features.basic
COPY example.basic /app/example.basic

# Set environment
ENV NODE_ENV=production
ENV PORT=3000
ENV BASICJIT_PATH=/app/bin/basicjit

EXPOSE 3000

CMD ["node", "server.js"]
