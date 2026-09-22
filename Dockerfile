# The analysis CLI, so a server operator can try this without installing Node, pnpm or a clone.
#
#   docker run --rm -v /srv/minecraft/plugins/JevCraft/data:/data:ro ghcr.io/nft-syou/jevcraft try /data
#
# Add -e TYPESAFE_API_KEY=... for real answers; without it the mock backend runs and says so.
# The image never needs the game server: point it at a copy of the JSONL if you prefer.
FROM node:24-slim

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
COPY packages/bot-recorder/package.json ./packages/bot-recorder/
COPY packages/cli/package.json ./packages/cli/
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY packages ./packages
COPY scripts ./scripts
COPY scenarios ./scenarios
COPY datasets/baselines ./datasets/baselines

# Written to by `try` unless --out-dir says otherwise; mount it to keep the intermediate files.
VOLUME ["/out"]
ENV JEVCRAFT_DEFAULT_OUT_DIR=/out

ENTRYPOINT ["node", "--import", "tsx", "packages/cli/src/main.ts"]
CMD ["try", "/data"]
