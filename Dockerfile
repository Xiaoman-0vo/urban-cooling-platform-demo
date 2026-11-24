ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build:accounts

FROM ${NODE_IMAGE} AS runtime
ENV NODE_ENV=production AGENT_HOST=0.0.0.0 AGENT_PORT=5181 \
    URBANCOOL_ACCOUNT_DB=/app/.runtime/accounts/workspace.sqlite \
    URBANCOOL_DEFAULT_PROVIDER=local URBANCOOL_COLLECTOR_MODE=disabled
WORKDIR /app
COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist/client ./dist/client
COPY --from=build /app/public/data ./public/data
COPY --from=build /app/server ./server
COPY --from=build /app/src ./src
COPY --from=build /app/weibo-demand-agent/scripts ./weibo-demand-agent/scripts
COPY --from=build /app/xiaohongshu_demand_agent/scripts ./xiaohongshu_demand_agent/scripts
RUN mkdir -p /app/.runtime && chown node:node /app/.runtime
USER node
EXPOSE 5181
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:5181/healthz',{signal:AbortSignal.timeout(2500)}).then(async r=>process.exit(r.ok&&(await r.json()).status==='ready'?0:1)).catch(()=>process.exit(1))"
CMD ["node","server/agent-server.mjs","--workbench"]

FROM runtime AS cloud-v3
USER root
COPY deploy/huawei/requirements-v3.txt /tmp/requirements-v3.txt
RUN apt-get update && apt-get install -y --no-install-recommends python3 python3-venv \
    && python3 -m venv /opt/v3 \
    && /opt/v3/bin/pip install --no-cache-dir -r /tmp/requirements-v3.txt \
    && rm -rf /var/lib/apt/lists/* /tmp/requirements-v3.txt
ENV URBANCOOL_LST_PYTHON=/opt/v3/bin/python
USER node

FROM runtime AS cloud
