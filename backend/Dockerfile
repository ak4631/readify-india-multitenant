# Build from the repository root: docker build -f backend/Dockerfile .
FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json prisma.config.ts ./
COPY prisma ./prisma
RUN DIRECT_URL=postgresql://build:build@localhost/build npm ci
COPY src ./src
COPY scripts ./scripts
COPY backend ./backend
COPY tsconfig.json ./
RUN DIRECT_URL=postgresql://build:build@localhost/build npm run backend:build

# Run as a separate one-off ECS task before rolling out the runtime image.
FROM build AS migrate
ENV NODE_ENV=production
CMD ["node", "scripts/backend-migrate.mjs"]

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 HOSTNAME=0.0.0.0 PORT=4000
COPY --from=build --chown=node:node /app/backend/.next/standalone ./
COPY --from=build --chown=node:node /app/backend/.next/static ./backend/.next/static
USER node
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://127.0.0.1:4000/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "backend/server.js"]

