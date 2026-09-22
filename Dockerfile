# The analysis CLI, so a server operator can try this without installing Node, pnpm or a clone.
#
#   docker run --rm -v /srv/minecraft/plugins/JevCraft/data:/data:ro ghcr.io/nft-syou/jevcraft try /data
#
# Add -e TYPESAFE_API_KEY=... for real answers; without it the mock backend runs and says so.
# The image never needs the game server: point it at a copy of the JSONL if you prefer.
FROM node:24-alpine

# corepack pins pnpm to the version in package.json, so the image matches CI.
RUN corepack enable

WORKDIR /app

# Dependencies first, so editing sources does not reinstall them.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/schema/package.json ./packages/schema/
COPY packages/jev-evaluator/package.json ./packages/jev-evaluator/
COPY packages/eval-runner/package.json ./packages/eval-runner/
COPY packages/feature-extractor/package.json ./packages/feature-extractor/
COPY packages/scenario-generator/package.json ./packages/scenario-generator/
COPY packages/cli/package.json ./packages/cli/
# --prod drops Biome, TypeScript and Vitest; tsx stays because the CLI runs straight from
# TypeScript. The lockfile is kept frozen, so minecraft-data is installed and then deleted rather
# than resolved away: @jevcraft/cli declares the bot recorder, and that one package is 390 MB of
# per-version game data the analysis path never opens. pnpm hardlinks its content-addressable
# store into node_modules, so leaving the store behind doubles the image for nothing.
RUN pnpm install --frozen-lockfile --prod \
    && rm -rf node_modules/.pnpm/minecraft-data@* node_modules/.pnpm/node_modules/minecraft-data \
    && rm -rf /root/.local/share/pnpm /root/.cache

COPY tsconfig.json ./
COPY packages ./packages
# `jevcraft record` is not available in this image; it is for analysing recordings, not making them.
RUN rm -rf packages/bot-recorder
COPY scripts ./scripts
COPY scenarios ./scenarios
COPY datasets/baselines ./datasets/baselines

# Written to by `try` unless --out-dir says otherwise; mount it to keep the intermediate files.
VOLUME ["/out"]
ENV JEVCRAFT_DEFAULT_OUT_DIR=/out

ENTRYPOINT ["node", "--import", "tsx", "packages/cli/src/main.ts"]
CMD ["try", "/data"]
