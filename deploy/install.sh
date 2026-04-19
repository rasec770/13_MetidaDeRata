#!/usr/bin/env bash
# Setup inicial del Droplet (Ubuntu 24.04 LTS).
# Ejecutar como root:   sudo bash deploy/install.sh
# Idempotente: puede correrse varias veces.

set -euo pipefail

APP_DIR=/var/www/onpe
DATA_DIR=/var/lib/onpe
APP_USER=onpe

if [[ $EUID -ne 0 ]]; then
	echo "Debe ejecutarse como root (sudo)." >&2
	exit 1
fi

echo "==> Paquetes del sistema"
apt-get update
apt-get install -y curl ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https

echo "==> Node.js 22 (NodeSource)"
if ! command -v node >/dev/null 2>&1; then
	curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
	apt-get install -y nodejs
fi

echo "==> Caddy (repositorio oficial)"
if ! command -v caddy >/dev/null 2>&1; then
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
		| gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
	curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
		> /etc/apt/sources.list.d/caddy-stable.list
	apt-get update
	apt-get install -y caddy
fi

echo "==> Usuario de servicio: ${APP_USER}"
id -u "${APP_USER}" >/dev/null 2>&1 || useradd --system --home "${APP_DIR}" --shell /usr/sbin/nologin "${APP_USER}"

echo "==> Directorios"
mkdir -p "${APP_DIR}" "${DATA_DIR}"
chown -R "${APP_USER}:${APP_USER}" "${APP_DIR}" "${DATA_DIR}"

# Caddy necesita leer history.jsonl
chmod 755 "${DATA_DIR}"
touch "${DATA_DIR}/history.jsonl"
chown "${APP_USER}:${APP_USER}" "${DATA_DIR}/history.jsonl"
chmod 644 "${DATA_DIR}/history.jsonl"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Instalando systemd unit"
install -m 644 "${SCRIPT_DIR}/onpe-recorder.service" /etc/systemd/system/onpe-recorder.service
systemctl daemon-reload

echo "==> Instalando Caddyfile"
install -m 644 "${SCRIPT_DIR}/Caddyfile" /etc/caddy/Caddyfile

cat <<EOF

==> Setup base listo.

Siguientes pasos (manual):

  1. Sincronizar el código a ${APP_DIR}:
       rsync -a --delete --exclude node_modules --exclude dist --exclude public/history.jsonl \\
         ./ root@<droplet-ip>:${APP_DIR}/

  2. Build + deps (como usuario ${APP_USER}):
       sudo -u ${APP_USER} bash -c 'cd ${APP_DIR} && npm ci && npm run build'

  3. Editar /etc/caddy/Caddyfile y reemplazar ':80' por tu dominio para HTTPS.
     Luego: systemctl reload caddy

  4. Arrancar el recorder:
       systemctl enable --now onpe-recorder
       journalctl -u onpe-recorder -f

EOF
