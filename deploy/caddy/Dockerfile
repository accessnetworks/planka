# Caddy with the Cloudflare DNS provider compiled in, so it can obtain Let's
# Encrypt certificates through a DNS-01 challenge. That works for a server that
# is only reachable on the internal network: Let's Encrypt never has to connect
# to it, it only checks a TXT record that Caddy writes through Cloudflare's API.

ARG CADDY_VERSION=2.11.4

FROM caddy:${CADDY_VERSION}-builder AS builder

RUN xcaddy build --with github.com/caddy-dns/cloudflare@v0.2.4

FROM caddy:${CADDY_VERSION}

COPY --from=builder /usr/bin/caddy /usr/bin/caddy
