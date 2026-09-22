# Deploying 1Plan Provisioning

This directory runs the fork in production at `https://planka.accessnet.works`
on a server that is only reachable from the internal network:

```
browser ──https──▶ caddy :443 ──▶ planka :1337 ──▶ postgres
                   (Let's Encrypt cert)   ▲
                                          └── backup (db + uploads, daily)
```

Caddy gets a real Let's Encrypt certificate through a Cloudflare **DNS-01**
challenge. Let's Encrypt never connects to the server. It only checks a TXT
record that Caddy creates through the Cloudflare API, so this works on an
internal-only host. Only Caddy publishes ports (80 redirects to 443).

All commands below run from this `deploy/` directory.

## Requirements

- Linux with Docker Engine and the Compose plugin. Use regular (rootful)
  Docker; see [Everyone gets rate-limited at once](#everyone-gets-rate-limited-at-once).
- For the first build: at least 4 GB RAM (or add swap) and about 10 GB free
  disk. The client build (Vite) and the Caddy build (Go) are the heavy parts.
- Ports 80 and 443 free on the server.
- Outbound HTTPS to Docker Hub / GitHub / npm (building), `api.cloudflare.com`
  and `acme-v02.api.letsencrypt.org` (certificates) and `auth.1plan.net` (SSO).

## 1. DNS

Clients only need the internal DNS override that already points
`planka.accessnet.works` at the server's private IP. Nothing public is
required for the certificate.

If you also add a public record in Cloudflare (like `ravan.accessnet.works`),
set it to **DNS only** (grey cloud). A proxied (orange) record can't reach a
private IP.

Every Let's Encrypt certificate is published in the public Certificate
Transparency logs, so the hostname (not the IP) becomes publicly visible.

## 2. Cloudflare API token

Cloudflare dashboard → My Profile → API Tokens → **Create Token** → template
**Edit zone DNS** → Zone Resources: *Include / Specific zone /
accessnet.works* → Create. Optionally, under Client IP Address Filtering,
restrict the token to the server's public egress IP.

## 3. Authentik

In the Authentik provider for the `1-plan-provisioning` application, add this
redirect URI exactly (strict match):

```
https://planka.accessnet.works/oidc-callback
```

Note the provider's client ID and client secret for the next step.

## 4. Configure

```bash
git clone <this repository> planka
```

```bash
cd planka/deploy
```

```bash
cp .env.example .env && chmod 600 .env
```

```bash
mkdir -m 700 backups
```

Fill in `.env`. Generate `SECRET_KEY` and `POSTGRES_PASSWORD` separately with:

```bash
openssl rand -hex 32
```

For SSO, set `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET`
together. An issuer without a client ID breaks the login page for everyone.

Keep a copy of `.env` somewhere safe (a password manager, for example). The
backups don't include it.

## 5. Start

```bash
docker compose up -d --build
```

The first build takes several minutes. Then watch the certificate being
issued (about a minute, including a 60 s wait for Cloudflare to publish the
challenge record):

```bash
docker compose logs -f caddy
```

Look for `certificate obtained successfully`, then press Ctrl-C.

## 6. Create the first admin

A fresh database has no users, and SSO users are always created as board
users, so create a local admin from the command line (it prompts for email,
password, name and username):

```bash
docker compose exec planka npm run db:create-admin-user
```

Sign in with it at https://planka.accessnet.works. After that, SSO users can
sign in, and you can promote them under Administration → Users.

Choose the admin's email deliberately:

- **Not your Authentik email**: the admin stays a local password account, a
  break-glass login for when Authentik is down.
- **Your Authentik email**: your first SSO sign-in takes over this account and
  turns off its password login.

## Backups

The `backup` service writes to `deploy/backups/` on startup and then every
`BACKUP_INTERVAL` seconds (default: daily):

- `planka-db-<time>.sql.gz`: the whole database
- `planka-data-<time>.tar.gz`: uploaded files (attachments, avatars,
  backgrounds)

It keeps the newest `BACKUP_KEEP` (default 14) of each kind. A failed backup
never deletes older ones, and it shows up in the logs as `FAILED`:

```bash
docker compose logs backup
```

Each file archive is a full copy, so the backups take about 14× the size of
your attachments. Keep an eye on free disk space.

The files are readable by root only, because a database dump contains live
session tokens. Copy them off the server regularly, for example:

```bash
sudo rsync -a backups/ backuphost:/srv/planka-backups/
```

To take a backup right now (for example before an upgrade), restart the
service and wait for both `wrote` lines:

```bash
docker compose restart backup && docker compose logs -f backup
```

If a backup ever leaks, sign everyone out by deleting all sessions:

```bash
docker compose exec postgres psql -U planka -d planka -c 'DELETE FROM session'
```

The repository's root `docker-backup.sh` and `docker-restore.sh` are for
upstream's layout and don't apply to this stack.

## Restore

This replaces the current database and uploads with a backup. To restore on a
new server, first complete steps 1–5 with the **same** `.env`, then follow
these steps.

Pick the backup's timestamp (the part between `planka-db-` and `.sql.gz`):

```bash
sudo ls backups/
```

```bash
TS=20260101T000000Z
```

Stop the app and the backup job:

```bash
docker compose stop planka backup
```

Recreate an empty database. Always drop it first: loading a dump over a
database that has since been migrated breaks startup.

```bash
docker compose run --rm --no-deps --entrypoint psql backup -d postgres -c 'DROP DATABASE planka WITH (FORCE)' -c 'CREATE DATABASE planka OWNER planka'
```

Load the dump:

```bash
docker compose run --rm --no-deps --entrypoint sh backup -c "gunzip -c /backups/planka-db-$TS.sql.gz | psql -v ON_ERROR_STOP=1 -q -o /dev/null"
```

Replace the uploaded files. The `test -f` check stops before anything is
deleted if the archive isn't there:

```bash
docker compose run --rm --no-deps --user root -v "$PWD/backups:/backups:ro" --entrypoint sh planka -c "test -f /backups/planka-data-$TS.tar.gz && find /app/data -mindepth 1 -delete && tar -xzf /backups/planka-data-$TS.tar.gz -C /app/data"
```

Start everything again. If the backup came from an older version, its
database is migrated forward automatically:

```bash
docker compose up -d
```

## Upgrading

Take a fresh backup first (see above), then:

```bash
git pull
```

```bash
docker compose pull postgres backup
```

```bash
docker compose build --pull
```

```bash
docker compose up -d
```

```bash
docker image prune -f
```

Database migrations run automatically when the app starts. If the app keeps
restarting afterwards, check `docker compose logs planka`, and restore the
backup you just took if needed.

## Good to know

- **Never run `docker compose down -v`.** The `-v` deletes the database, the
  uploads and the certificates. Plain `docker compose down` is safe.
- The server fetches link favicons, webhooks and notification URLs through a
  built-in proxy that refuses private, loopback and link-local addresses
  (`OUTGOING_BLOCKED_IPS` in `docker-compose.yml`). So links to internal sites
  get no favicon, and webhooks can't target internal hosts.
- Container logs are capped at 5 × 10 MB per service.

## Troubleshooting

### No certificate

```bash
docker compose logs caddy | grep -iE 'error|challenge|certificate'
```

- Check the Cloudflare token (step 2) and that the server can reach
  `api.cloudflare.com` and `acme-v02.api.letsencrypt.org` on port 443.
- If the error mentions looking up the zone, edit the token and add
  **Zone → Zone → Read** for the same zone.

### Login page shows an error after enabling SSO

- `OIDC_ISSUER`, `OIDC_CLIENT_ID` and `OIDC_CLIENT_SECRET` must all be set.
  Fix `.env`, then run `docker compose up -d`.
- If Authentik reports a redirect URI mismatch, check step 3.

### Everyone gets rate-limited at once

Sign-in attempts are rate-limited per client IP, so the app must see real
client IPs. Check the addresses recorded for recent sign-ins:

```bash
docker compose exec postgres psql -U planka -d planka -c 'SELECT DISTINCT remote_address FROM session'
```

If they all show the Docker gateway (`172.x.0.1`), Docker is hiding client
addresses. This happens with rootless Docker, for example. Switch to regular
Docker.

Don't "fix" this by adding `trusted_proxies` to the Caddyfile. Your clients
are on private IPs, so that would let any user fake their address.
