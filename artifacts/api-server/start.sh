#!/bin/sh
set -eu

# Tailscale sidecar: brings the container onto the user's private tailnet so it
# can reach the self-hosted Ollama on their laptop over WireGuard (no public
# exposure, no data leaving the tailnet).
#
# Requires env:
#   TS_AUTHKEY            reusable+ephemeral auth key tagged tag:railway
#   OLLAMA_BASE_URL       e.g. http://win-vha2meai92a:11434
# Optional:
#   TS_HOSTNAME           defaults to railway-api-<environment>-<service>
#   TS_EXTRA_ARGS         passed verbatim to `tailscale up`

if [ -n "${TS_AUTHKEY:-}" ]; then
  mkdir -p /var/run/tailscale /var/lib/tailscale /var/log/tailscale

  TS_HOSTNAME="${TS_HOSTNAME:-railway-api-${RAILWAY_ENVIRONMENT_NAME:-unknown}-${RAILWAY_SERVICE_NAME:-api}}"

  # Start tailscaled in userspace networking mode with an HTTP proxy on :1055
  # so Node fetch (via undici EnvHttpProxyAgent) can reach tailnet hosts.
  /usr/sbin/tailscaled \
    --tun=userspace-networking \
    --socks5-server=localhost:1055 \
    --outbound-http-proxy-listen=localhost:1055 \
    --state=/var/lib/tailscale/tailscaled.state \
    --socket=/var/run/tailscale/tailscaled.sock \
    >/var/log/tailscale/tailscaled.log 2>&1 &

  # Wait briefly for the socket to appear.
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

  export HTTP_PROXY="http://localhost:1055"
  export HTTPS_PROXY="http://localhost:1055"
  export NO_PROXY="localhost,127.0.0.1,::1,*.railway.app,*.railway.internal"

  echo "tailscale up — hostname=${TS_HOSTNAME} proxy=localhost:1055"
else
  echo "TS_AUTHKEY not set — starting without Tailscale (AI calls to tailnet hosts will fail)"
fi

exec pnpm run start:api-server
