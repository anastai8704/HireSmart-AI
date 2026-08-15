# Backend container
# -----------------------------------------------------------------------------
# A multi-stage build. The first stage installs dependencies; the final image
# copies in only what it needs. This keeps the shipped image small and means
# build tools never reach production.

FROM node:20-alpine AS deps

WORKDIR /app

# Copy ONLY the manifests first. Docker caches each layer, so as long as these
# two files are unchanged it reuses the installed node_modules instead of
# re-downloading everything on every code edit.
COPY package.json package-lock.json ./

# `npm ci --omit=dev` installs the exact locked versions, production only.
RUN npm ci --omit=dev


FROM node:20-alpine AS runtime

# Alpine images ship with a non-root `node` user. Running as root inside a
# container is a real risk: a compromised process would have full control.
WORKDIR /app

ENV NODE_ENV=production

COPY --from=deps /app/node_modules ./node_modules
COPY --chown=node:node . .

# Resumes are written here when STORAGE_PROVIDER=local.
RUN mkdir -p uploads logs && chown -R node:node uploads logs

USER node

EXPOSE 5000

# A health check lets Docker (and orchestrators) know when the API is actually
# ready to serve traffic, rather than merely "the process started".
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "require('http').get('http://127.0.0.1:5000/health',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "server.js"]
