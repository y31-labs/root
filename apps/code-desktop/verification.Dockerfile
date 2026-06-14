FROM mcr.microsoft.com/playwright:v1.55.0-noble@sha256:b27e719ecbfef153e13fd24e8341736733bf2658b229677eb21ff57ff5d7fb29

ARG TARGETARCH
ARG BUN_VERSION=1.3.5
ARG PLAYWRIGHT_VERSION=1.55.0
ARG VERIFIER_SCHEMA_VERSION=1
ARG VERIFIER_PROTOCOL_VERSION=1
ARG VERIFIER_FINGERPRINT=sha256:46960e4bee087eeae3b22c38bb98d68565f2a91f5bf08bdadf3b26ebb3a58361

LABEL org.opencontainers.image.title="Code Desktop verifier" \
  org.opencontainers.image.version="1.0.0" \
  org.opencontainers.image.code.secret-scanner="code-diff-secret-scanner" \
  org.opencontainers.image.code.secret-scanner.version="1.0.0" \
  dev.root.code.verifier.schema="${VERIFIER_SCHEMA_VERSION}" \
  dev.root.code.verifier.protocol="${VERIFIER_PROTOCOL_VERSION}" \
  dev.root.code.verifier.architecture="${TARGETARCH}" \
  dev.root.code.verifier.bun="${BUN_VERSION}" \
  dev.root.code.verifier.playwright="${PLAYWRIGHT_VERSION}" \
  dev.root.code.verifier.browser="chromium" \
  dev.root.code.verifier.fingerprint="${VERIFIER_FINGERPRINT}"

RUN apt-get update \
  && apt-get install -y --no-install-recommends unzip \
  && rm -rf /var/lib/apt/lists/* \
  && case "${TARGETARCH}" in \
    arm64) BUN_ARCH=aarch64; BUN_SHA256=ed01000f85bd97785228ad2845dc92a1860b8054856826d7317690ac8f8ee74b ;; \
    amd64) BUN_ARCH=x64; BUN_SHA256=7051d86a924aefea3e0b96213b5fd8f79c0793f9cae6534233e627e5c3db4669 ;; \
    *) echo "Unsupported verifier architecture: ${TARGETARCH}" >&2; exit 1 ;; \
  esac \
  && curl -fsSLo /tmp/bun.zip \
    "https://github.com/oven-sh/bun/releases/download/bun-v${BUN_VERSION}/bun-linux-${BUN_ARCH}.zip" \
  && echo "${BUN_SHA256}  /tmp/bun.zip" | sha256sum -c - \
  && unzip -q /tmp/bun.zip -d /tmp/bun \
  && cp "/tmp/bun/bun-linux-${BUN_ARCH}/bun" /usr/local/bin/bun \
  && chmod 0755 /usr/local/bin/bun \
  && rm -rf /tmp/bun /tmp/bun.zip

RUN mkdir -p /opt/code-browser \
  && cd /opt/code-browser \
  && bun add --exact "playwright@${PLAYWRIGHT_VERSION}" \
  && test "$(bun --version)" = "${BUN_VERSION}" \
  && test "$(node -p "require('playwright/package.json').version")" = "${PLAYWRIGHT_VERSION}"

ENV NODE_PATH=/opt/code-browser/node_modules
COPY --chmod=0555 src-tauri/secret-scanner-v1.cjs /opt/code-verifier/secret-scanner-v1.cjs
RUN printf '%s\n' \
    "{\"schemaVersion\":\"${VERIFIER_SCHEMA_VERSION}\",\"protocolVersion\":\"${VERIFIER_PROTOCOL_VERSION}\",\"architecture\":\"${TARGETARCH}\",\"bunVersion\":\"${BUN_VERSION}\",\"playwrightVersion\":\"${PLAYWRIGHT_VERSION}\",\"browser\":\"chromium\",\"fingerprint\":\"${VERIFIER_FINGERPRINT}\"}" \
    > /opt/code-verifier/runtime-metadata.json \
  && chmod 0444 /opt/code-verifier/runtime-metadata.json \
  && ln -s /opt/code-verifier/secret-scanner-v1.cjs /usr/local/bin/code-secret-scanner

WORKDIR /workspace
ENTRYPOINT []
