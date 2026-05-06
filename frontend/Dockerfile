# ──────────────────────────────────────────────────────────────
#  M-Motors — Next.js 15 (App Router)
#  Multi-stage build : deps → builder → runner
#  Node ≥ 20.19 requis par la chaîne ESLint 9 (eslint-visitor-keys).
#
#  Build  : docker build -t mmotors-nextjs .
#  Run    : docker run -p 3000:3000 mmotors-nextjs
# ──────────────────────────────────────────────────────────────

# ── Stage 1 : dependencies ────────────────────────────────────
FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --prefer-offline

# ── Stage 2 : builder ─────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Next.js peut fonctionner sans assets statiques ; le dossier doit exister pour le stage runner.
RUN mkdir -p public

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build

# ── Stage 3 : runner (image finale ~160 Mo) ───────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Utilisateur non-root pour la sécurité
RUN addgroup --system --gid 1001 nodejs \
 && adduser  --system --uid 1001 nextjs

# Copie uniquement ce qui est nécessaire à l'exécution
COPY --from=builder /app/public         ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static     ./.next/static

USER nextjs

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -q --spider http://localhost:3000/ || exit 1

CMD ["node", "server.js"]
