#!/bin/sh
set -eu

# Tailscale sidecar: joins the container to the user's private tailnet so the
# api-server can reach a self-hosted Ollama over WireGuard — without exposing
# it publicly and without client data ever leaving the tailnet.
#
# Required env:
#   TS_AUTHKEY            reusable+ephemeral auth key tagged tag:railway
# Optional env:
#   TS_HOSTNAME           default: railway-api-<environment>-<service>
#   TS_EXTRA_ARGS         passed verbatim to `tailscale up`

if [ -n "${TS_AUTHKEY:-}" ]; then
  mkdir -p /var/run/tailscale /var/lib/tailscale /var/log/tailscale

  RAW_HOSTNAME="${TS_HOSTNAME:-railway-api-${RAILWAY_ENVIRONMENT_NAME:-unknown}-${RAILWAY_SERVICE_NAME:-api}}"
  TS_HOSTNAME=$(printf '%s' "$RAW_HOSTNAME" | tr -c 'A-Za-z0-9-' '-' | sed 's/-\+/-/g; s/^-//; s/-$//')

  /usr/sbin/tailscaled \
    --tun=userspace-networking \
    --socks5-server=localhost:1055 \
    --outbound-http-proxy-listen=localhost:1055 \
    --state=/var/lib/tailscale/tailscaled.state \
    --socket=/var/run/tailscale/tailscaled.sock \
    >/var/log/tailscale/tailscaled.log 2>&1 &

  for i in 1 2 3 4 5 6 7 8 9 10; do
    [ -S /var/run/tailscale/tailscaled.sock ] && break
    sleep 0.3
  done

  /usr/bin/tailscale up \
    --authkey="${TS_AUTHKEY}" \
    --hostname="${TS_HOSTNAME}" \
    --advertise-tags=tag:railway \
    --accept-dns=true \
    ${TS_EXTRA_ARGS:-}

  # Route outbound HTTP from Node fetch through the tailscaled proxy on :1055.
  # NODE_USE_ENV_PROXY=1 (Node 22.15+/24+) makes global fetch honor HTTP_PROXY.
  export HTTP_PROXY="http://localhost:1055"
  export HTTPS_PROXY="http://localhost:1055"
  export NO_PROXY="localhost,127.0.0.1,::1,.railway.app,.railway.internal"
  export NODE_USE_ENV_PROXY=1

  echo "tailscale up — hostname=${TS_HOSTNAME} proxy=localhost:1055"
else
  echo "TS_AUTHKEY not set — starting without Tailscale (tailnet hosts unreachable)"
fi

exec pnpm --filter @workspace/api-server run start
