# CodexMonitor Cloudflare Web Bridge Deployment

This runbook is for the case where you are standing in the server's repo checkout and want:

- the web frontend on Cloudflare Pages
- the local bridge on the server
- the local daemon on the same server
- Cloudflare Tunnel in front of the bridge
- Cloudflare Access protecting the browser-to-bridge path
- optional `launchctl` management on macOS

Example topology:

```text
browser
  -> https://monitor.example.com        (Cloudflare Pages)
  -> https://bridge.example.com         (Cloudflare Tunnel + Access)
  -> 127.0.0.1:8787                    (local bridge)
  -> 127.0.0.1:4732                    (local daemon)
```

## 1. Values to replace

Pick your real values first and reuse them throughout the document:

```bash
export REPO_DIR="$HOME/workspace/CodexMonitor"
export WEB_HOST="monitor.example.com"
export BRIDGE_HOST="bridge.example.com"
export PAGES_PROJECT="codex-monitor-web"
export TUNNEL_NAME="codex-monitor-bridge"
export DAEMON_LISTEN="127.0.0.1:4732"
export BRIDGE_LISTEN="127.0.0.1:8787"
export DATA_DIR="$REPO_DIR/.deploy/data"
export LOG_DIR="$REPO_DIR/.deploy/log"
export DAEMON_TOKEN="replace-with-a-long-random-token"
```

If you want a fresh daemon token:

```bash
openssl rand -hex 32
```

## 2. Server prerequisites

From the repo root:

```bash
cd "$REPO_DIR"
npm ci
```

Rust build prerequisites still need to be present on the server. This repo already documents the base requirement set in `README.md`.

Create local state and log directories:

```bash
mkdir -p "$DATA_DIR" "$LOG_DIR"
```

Notes:

- `workspaces.json` and `settings.json` will live under `"$DATA_DIR"`.
- An empty `"$DATA_DIR"` is allowed. You can add workspaces later from the web UI.

## 3. Build the local daemon and local bridge

Build both server-side binaries from the repo:

```bash
cd "$REPO_DIR/src-tauri"
cargo build --release --locked \
  --bin codex_monitor_daemon \
  --bin codex_monitor_daemonctl \
  --bin codex_monitor_web_bridge
```

Built binaries will be here:

```text
$REPO_DIR/src-tauri/target/release/codex_monitor_daemon
$REPO_DIR/src-tauri/target/release/codex_monitor_daemonctl
$REPO_DIR/src-tauri/target/release/codex_monitor_web_bridge
```

Useful help commands:

```bash
"$REPO_DIR/src-tauri/target/release/codex_monitor_daemon" --help
"$REPO_DIR/src-tauri/target/release/codex_monitor_daemonctl" --help
```

## 4. Start the local daemon manually

Run the daemon directly:

```bash
cd "$REPO_DIR"
CODEX_MONITOR_DAEMON_TOKEN="$DAEMON_TOKEN" \
  "$REPO_DIR/src-tauri/target/release/codex_monitor_daemon" \
  --listen "$DAEMON_LISTEN" \
  --data-dir "$DATA_DIR"
```

If you want a second terminal for status checks:

```bash
cd "$REPO_DIR"
"$REPO_DIR/src-tauri/target/release/codex_monitor_daemonctl" status \
  --listen "$DAEMON_LISTEN" \
  --token "$DAEMON_TOKEN" \
  --data-dir "$DATA_DIR" \
  --json
```

If you want the exact daemon launch command preview:

```bash
cd "$REPO_DIR"
"$REPO_DIR/src-tauri/target/release/codex_monitor_daemonctl" command-preview \
  --listen "$DAEMON_LISTEN" \
  --token "$DAEMON_TOKEN" \
  --data-dir "$DATA_DIR" \
  --daemon-path "$REPO_DIR/src-tauri/target/release/codex_monitor_daemon"
```

## 5. Start the local bridge manually

The bridge should stay private on the server. Do not publish `"$BRIDGE_LISTEN"` directly.

Run it like this:

```bash
cd "$REPO_DIR"
CODEX_MONITOR_WEB_BRIDGE_LISTEN="$BRIDGE_LISTEN" \
CODEX_MONITOR_WEB_BRIDGE_DAEMON_HOST="$DAEMON_LISTEN" \
CODEX_MONITOR_WEB_BRIDGE_DAEMON_TOKEN="$DAEMON_TOKEN" \
CODEX_MONITOR_WEB_BRIDGE_REQUIRE_CF_ACCESS_HEADER=true \
CODEX_MONITOR_WEB_BRIDGE_ALLOWED_ORIGINS="https://$WEB_HOST" \
  "$REPO_DIR/src-tauri/target/release/codex_monitor_web_bridge"
```

Recommended production values:

- `CODEX_MONITOR_WEB_BRIDGE_LISTEN=127.0.0.1:8787`
- `CODEX_MONITOR_WEB_BRIDGE_DAEMON_HOST=127.0.0.1:4732`
- `CODEX_MONITOR_WEB_BRIDGE_REQUIRE_CF_ACCESS_HEADER=true`
- `CODEX_MONITOR_WEB_BRIDGE_ALLOWED_ORIGINS=https://monitor.example.com`

Why these matter:

- `CODEX_MONITOR_WEB_BRIDGE_REQUIRE_CF_ACCESS_HEADER=true` makes the bridge require the `cf-access-jwt-assertion` header.
- `CODEX_MONITOR_WEB_BRIDGE_ALLOWED_ORIGINS` limits browser origins that may call the bridge.

If you keep the default `*.pages.dev` hostname active during rollout, add it too:

```bash
CODEX_MONITOR_WEB_BRIDGE_ALLOWED_ORIGINS="https://$WEB_HOST,https://<your-project>.pages.dev"
```

## 6. Build the web frontend

The web build must know the public bridge URL that the browser will call:

```bash
cd "$REPO_DIR"
VITE_CODEXMONITOR_BRIDGE_URL="https://$BRIDGE_HOST" \
  npm run build:web
```

Build output:

```text
$REPO_DIR/dist
```

Important:

- Use `npm run build:web` for the browser bundle.
- Do not replace it with plain `vite build` or the desktop-oriented build flow.
- If you want to inspect the result locally before deploying, serve `dist/` and confirm the first-run bridge setup UI is present.

## 7. Install and configure Cloudflare CLI

For this runbook, "Cloudflare CLI" means `wrangler` for Pages deployments.

Cloudflare recommends installing Wrangler locally in the project. From the repo root:

```bash
cd "$REPO_DIR"
npm i -D wrangler@latest
npx wrangler --version
```

If you do not want the deployment checkout to modify `package.json` or `package-lock.json`, use the temporary form instead:

```bash
npx wrangler@latest --version
```

Two ways to authenticate:

### Option A: interactive login

Use this when the machine running the command can complete a browser login:

```bash
cd "$REPO_DIR"
npx wrangler login
```

### Option B: API token

Use this for headless deployment or CI.

In Cloudflare Dashboard:

1. Create an API token with `Account / Cloudflare Pages / Edit`.
2. Copy your Cloudflare account ID.

Then export them in the shell:

```bash
export CLOUDFLARE_API_TOKEN="replace-with-pages-api-token"
export CLOUDFLARE_ACCOUNT_ID="replace-with-account-id"
```

This runbook uses API-token deploy commands because they work well on a server.

## 8. Create and deploy the Cloudflare Pages site

### 8.1 Create the Pages project

Create the Pages project once in Cloudflare Dashboard:

1. Go to `Workers & Pages`.
2. Create a Pages project named `"$PAGES_PROJECT"`.
3. You can choose Direct Upload for this runbook.

### 8.2 Deploy from the repo

From the repo root:

```bash
cd "$REPO_DIR"
CLOUDFLARE_ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID" \
CLOUDFLARE_API_TOKEN="$CLOUDFLARE_API_TOKEN" \
  npx wrangler pages deploy dist --project-name "$PAGES_PROJECT"
```

### 8.3 Add the custom domain

In Cloudflare Dashboard:

1. Go to `Workers & Pages > $PAGES_PROJECT > Custom domains`.
2. Add `"$WEB_HOST"`.
3. Wait until the domain becomes active.

If the zone is not managed by Cloudflare nameservers, follow the Pages custom-domain prompt and add the requested CNAME at your DNS provider.

### 8.4 Optional: protect the frontend with Cloudflare Access

This is optional. The required Access protection in this runbook is for the bridge hostname.

If you also want Access in front of the frontend:

1. Add the Pages custom domain first.
2. Only after the custom domain is attached, create the Access app for that custom domain.

Cloudflare's Pages known-issues page explicitly notes that a custom domain cannot be added while Access is already enabled on that domain, so the order matters.

## 9. Install and configure `cloudflared`

On macOS, Cloudflare documents Homebrew installation:

```bash
brew install cloudflared
cloudflared --version
```

Authenticate `cloudflared` to your Cloudflare account:

```bash
cloudflared tunnel login
```

That creates the local certificate used for tunnel management.

## 10. Create the Cloudflare Tunnel

Create a locally-managed tunnel:

```bash
cloudflared tunnel create "$TUNNEL_NAME"
cloudflared tunnel list
```

Take note of:

- the tunnel UUID
- the generated credentials file path under `~/.cloudflared/`

Create the tunnel config:

```bash
mkdir -p "$HOME/.cloudflared"
```

Create `~/.cloudflared/config.yml`:

```yaml
tunnel: <TUNNEL_UUID>
credentials-file: /Users/<your-user>/.cloudflared/<TUNNEL_UUID>.json

ingress:
  - hostname: bridge.example.com
    service: http://127.0.0.1:8787
  - service: http_status:404
```

Create the DNS route:

```bash
cloudflared tunnel route dns "$TUNNEL_NAME" "$BRIDGE_HOST"
```

Hostname note:

- Prefer a single-label hostname such as `bridge.example.com`.
- If you choose a deeper hostname such as `machine.bridge.example.com`, make sure your certificate coverage already includes that exact hostname. A normal `*.example.com` wildcard does not cover arbitrary deeper levels.

Run the tunnel manually once:

```bash
cloudflared tunnel run "$TUNNEL_NAME"
```

Useful checks:

```bash
cloudflared tunnel info "$TUNNEL_NAME"
cloudflared tunnel list
```

## 11. Configure Cloudflare Access for the bridge hostname

This is the required protection layer for the bridge.

In Cloudflare Zero Trust:

1. Go to `Access controls > Applications`.
2. Add an application.
3. Choose `Self-hosted`.
4. Name it something like `CodexMonitor Bridge`.
5. Add public hostname `"$BRIDGE_HOST"`.
6. Add at least one `Allow` policy for the users who should be able to use the bridge.
7. Save the application.

Recommended settings:

- enable your real identity provider
- turn on `Instant Auth` if you only allow one provider
- keep the bridge hostname private and do not add public bypass rules
- if the frontend is also behind Access, prefer managing `"$WEB_HOST"` and `"$BRIDGE_HOST"` in the same Access application so they stay under one policy set

Important order:

- create the Access app before exposing the route broadly
- keep `CODEX_MONITOR_WEB_BRIDGE_REQUIRE_CF_ACCESS_HEADER=true` on the bridge

### 11.1 Required CORS setting for browser-to-bridge requests

Because the frontend and bridge use different hostnames, the browser sends a preflight `OPTIONS` request before the real bridge RPC call.

If Access protects `"$BRIDGE_HOST"` and you do not configure preflight handling, the browser will fail with a CORS error before the request ever reaches the bridge.

Recommended setup in the Access application for `"$BRIDGE_HOST"`:

1. Open `Advanced settings > Cross-Origin Resource Sharing (CORS) settings`.
2. Turn on `Bypass options requests to origin`.

Why this is the recommended choice here:

- the CodexMonitor bridge already returns the required CORS headers
- letting `OPTIONS` reach the bridge avoids duplicating the same policy in two places

Alternative:

- instead of bypassing `OPTIONS`, you can configure Access to answer preflight requests itself
- if you choose that route, the Access CORS response must match the bridge policy:
  - allowed origin: `https://$WEB_HOST`
  - allowed methods: `POST, OPTIONS`
  - allowed headers: `content-type, cf-access-jwt-assertion`
  - allow credentials: enabled

## 12. Enable Access validation in the tunnel

Cloudflare's self-hosted app guide recommends validating the Access token at the origin layer and specifically calls out `Protect with Access` for `cloudflared`.

After the bridge Access app exists:

1. Open the tunnel in Cloudflare Dashboard.
2. Find the published application route for `"$BRIDGE_HOST"`.
3. Enable `Protect with Access`.

Result:

- Cloudflare Access protects the public hostname
- `cloudflared` validates the Access token before forwarding
- the bridge still checks for the `cf-access-jwt-assertion` header

That gives you two checks instead of trusting the public hostname blindly.

## 13. End-to-end rollout order

Use this order in production:

1. `npm ci`
2. build daemon + bridge
3. build frontend with `VITE_CODEXMONITOR_BRIDGE_URL=https://$BRIDGE_HOST`
4. deploy Pages
5. attach the Pages custom domain
6. install `cloudflared`
7. create the tunnel
8. route `"$BRIDGE_HOST"` to `http://127.0.0.1:8787`
9. create the Access app for `"$BRIDGE_HOST"`
10. enable `Protect with Access`
11. start daemon
12. start bridge
13. start `cloudflared`
14. open `https://$WEB_HOST` and complete a real browser test

## 14. macOS `launchctl` setup

Cloudflare officially supports `cloudflared service install` on macOS. For the CodexMonitor daemon and bridge, use your own `launchctl` plists.

### 14.1 Recommended log and runtime directories

```bash
mkdir -p "$REPO_DIR/.deploy/log"
mkdir -p "$REPO_DIR/.deploy/data"
mkdir -p "$HOME/Library/LaunchAgents"
```

### 14.2 Daemon plist

Create `~/Library/LaunchAgents/com.codexmonitor.daemon.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.codexmonitor.daemon</string>

    <key>ProgramArguments</key>
    <array>
      <string>/Users/you/workspace/CodexMonitor/src-tauri/target/release/codex_monitor_daemon</string>
      <string>--listen</string>
      <string>127.0.0.1:4732</string>
      <string>--data-dir</string>
      <string>/Users/you/workspace/CodexMonitor/.deploy/data</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
      <key>CODEX_MONITOR_DAEMON_TOKEN</key>
      <string>replace-with-your-token</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>/Users/you/workspace/CodexMonitor</string>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/you/workspace/CodexMonitor/.deploy/log/daemon.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/you/workspace/CodexMonitor/.deploy/log/daemon.stderr.log</string>
  </dict>
</plist>
```

Load it:

```bash
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.codexmonitor.daemon.plist"
launchctl enable "gui/$(id -u)/com.codexmonitor.daemon"
launchctl kickstart -k "gui/$(id -u)/com.codexmonitor.daemon"
```

### 14.3 Bridge plist

Create `~/Library/LaunchAgents/com.codexmonitor.web-bridge.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>com.codexmonitor.web-bridge</string>

    <key>ProgramArguments</key>
    <array>
      <string>/Users/you/workspace/CodexMonitor/src-tauri/target/release/codex_monitor_web_bridge</string>
    </array>

    <key>EnvironmentVariables</key>
    <dict>
      <key>CODEX_MONITOR_WEB_BRIDGE_LISTEN</key>
      <string>127.0.0.1:8787</string>
      <key>CODEX_MONITOR_WEB_BRIDGE_DAEMON_HOST</key>
      <string>127.0.0.1:4732</string>
      <key>CODEX_MONITOR_WEB_BRIDGE_DAEMON_TOKEN</key>
      <string>replace-with-your-token</string>
      <key>CODEX_MONITOR_WEB_BRIDGE_REQUIRE_CF_ACCESS_HEADER</key>
      <string>true</string>
      <key>CODEX_MONITOR_WEB_BRIDGE_ALLOWED_ORIGINS</key>
      <string>https://monitor.example.com</string>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string>
    </dict>

    <key>WorkingDirectory</key>
    <string>/Users/you/workspace/CodexMonitor</string>

    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>

    <key>StandardOutPath</key>
    <string>/Users/you/workspace/CodexMonitor/.deploy/log/bridge.stdout.log</string>
    <key>StandardErrorPath</key>
    <string>/Users/you/workspace/CodexMonitor/.deploy/log/bridge.stderr.log</string>
  </dict>
</plist>
```

Load it:

```bash
launchctl bootstrap "gui/$(id -u)" "$HOME/Library/LaunchAgents/com.codexmonitor.web-bridge.plist"
launchctl enable "gui/$(id -u)/com.codexmonitor.web-bridge"
launchctl kickstart -k "gui/$(id -u)/com.codexmonitor.web-bridge"
```

### 14.4 `cloudflared` on macOS

Cloudflare's documented macOS path is simpler than a hand-written plist:

```bash
cloudflared service install
```

That installs a launch agent using `~/.cloudflared/`.

If you prefer boot-time service instead of login-time service:

```bash
sudo cloudflared service install
```

Useful service commands:

```bash
sudo launchctl start com.cloudflare.cloudflared
sudo launchctl stop com.cloudflare.cloudflared
```

Cloudflare documents the macOS logs here:

```text
/Library/Logs/com.cloudflare.cloudflared.err.log
/Library/Logs/com.cloudflare.cloudflared.out.log
```

### 14.5 Login-time vs boot-time on macOS

- `~/Library/LaunchAgents` runs in the logged-in user's session.
- `/Library/LaunchDaemons` runs at boot, but then every path and permission must also work without an interactive login.

If this machine is a headless server and no user session is guaranteed, prefer boot-time services:

- `sudo cloudflared service install` for `cloudflared`
- `/Library/LaunchDaemons` for the CodexMonitor daemon and bridge

If this machine is your own logged-in Mac mini or desktop, the user-level `LaunchAgents` examples above are usually simpler.

## 15. Validation checklist

After everything is up:

```bash
lsof -nP -iTCP:4732 -sTCP:LISTEN
lsof -nP -iTCP:8787 -sTCP:LISTEN
cloudflared tunnel info "$TUNNEL_NAME"
```

Then test in a real browser:

1. Open `https://$WEB_HOST`.
2. Confirm the Pages frontend loads.
3. Confirm the browser is challenged by Access when it first reaches `https://$BRIDGE_HOST`.
4. Confirm the app can list workspaces and open normal UI without a blank screen.
5. Confirm bridge switching still works if you have more than one bridge URL configured in the browser.

Preflight check:

```bash
curl -i -X OPTIONS "https://$BRIDGE_HOST/api/rpc" \
  -H "Origin: https://$WEB_HOST" \
  -H "Access-Control-Request-Method: POST" \
  -H "Access-Control-Request-Headers: content-type"
```

Expected result:

- not `403`
- response includes `Access-Control-Allow-Origin`

## 16. Known gotchas

- If `"$WEB_HOST"` is a Pages custom domain and you want Access on it too, attach the custom domain first and only then add the Access app.
- If the bridge hostname is behind Access, you must also handle preflight `OPTIONS` requests or the browser will fail with a CORS error before the bridge sees the request.
- If `CODEX_MONITOR_WEB_BRIDGE_ALLOWED_ORIGINS` is too strict, the frontend will fail with CORS errors.
- If `CODEX_MONITOR_WEB_BRIDGE_REQUIRE_CF_ACCESS_HEADER=true` but `Protect with Access` is not enabled, bridge requests will fail with `401`.
- If you build with the wrong command and skip `npm run build:web`, the deployed frontend may come up in the wrong runtime and web-only behavior can disappear.
- If the tunnel DNS record exists but `cloudflared` is not running, users will see a tunnel/DNS failure instead of reaching the bridge.
- If you use a deeper hostname than your certificate covers, TLS will fail even if the tunnel and DNS record are correct.
- Do not expose the daemon directly on a public interface. The public hostname should terminate at Cloudflare Tunnel and forward only to the bridge.

## 17. Official references

- Cloudflare Wrangler install/update:
  `https://developers.cloudflare.com/workers/wrangler/install-and-update/`
- Wrangler login command:
  `https://developers.cloudflare.com/workers/wrangler/commands/general/`
- Cloudflare Pages direct upload with Wrangler:
  `https://developers.cloudflare.com/pages/how-to/use-direct-upload-with-continuous-integration/`
- Cloudflare Pages custom domains:
  `https://developers.cloudflare.com/pages/configuration/custom-domains/`
- Cloudflare Pages known issues, including Access ordering:
  `https://developers.cloudflare.com/pages/platform/known-issues/`
- Cloudflare Tunnel setup:
  `https://developers.cloudflare.com/tunnel/setup/`
- Locally-managed tunnel creation:
  `https://developers.cloudflare.com/tunnel/advanced/local-management/create-local-tunnel/`
- Cloudflare Tunnel DNS routing:
  `https://developers.cloudflare.com/tunnel/routing/`
- Cloudflare Access self-hosted applications:
  `https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/`
- Cloudflare Access CORS and preflight handling:
  `https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/cors/`
- `cloudflared` as a macOS service:
  `https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/do-more-with-tunnels/local-management/as-a-service/macos/`
