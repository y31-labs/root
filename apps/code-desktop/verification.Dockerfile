FROM mcr.microsoft.com/playwright:v1.55.0-noble

ARG BUN_VERSION=1.3.5
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v${BUN_VERSION}" \
  && cp /root/.bun/bin/bun /usr/local/bin/bun \
  && chmod 0755 /usr/local/bin/bun

WORKDIR /workspace
ENTRYPOINT []
