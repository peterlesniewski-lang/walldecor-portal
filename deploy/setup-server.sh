#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# WallDecor Portal — Server Setup Script
# Run as ubuntu user on OVH VPS (Ubuntu 22.04+)
# Usage: bash setup-server.sh
# ─────────────────────────────────────────────────────────────────────────────
set -e

APP_DIR="/var/www/walldecor-portal"
GITHUB_REPO="https://github.com/peterlesniewski-lang/walldecor-portal.git"
NGINX_CONF="/etc/nginx/sites-available/walldecor"
APP_PORT=3000

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
info()  { echo -e "${GREEN}[INFO]${NC} $1"; }
warn()  { echo -e "${YELLOW}[WARN]${NC} $1"; }
error() { echo -e "${RED}[ERROR]${NC} $1"; exit 1; }

# ─── 1. System update ─────────────────────────────────────────────────────────
info "Updating system packages..."
sudo apt-get update -qq
sudo apt-get upgrade -y -qq

# ─── 2. Node.js 20 ────────────────────────────────────────────────────────────
if ! command -v node &>/dev/null || [[ "$(node -v | cut -d. -f1 | tr -d 'v')" -lt 20 ]]; then
    info "Installing Node.js 20..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi
info "Node.js: $(node -v) | npm: $(npm -v)"

# ─── 3. PM2 ───────────────────────────────────────────────────────────────────
if ! command -v pm2 &>/dev/null; then
    info "Installing PM2..."
    sudo npm install -g pm2
fi
info "PM2: $(pm2 --version)"

# ─── 4. Nginx ─────────────────────────────────────────────────────────────────
if ! command -v nginx &>/dev/null; then
    info "Installing Nginx..."
    sudo apt-get install -y nginx
fi
sudo systemctl enable nginx
info "Nginx: $(nginx -v 2>&1)"

# ─── 5. MySQL 8 ───────────────────────────────────────────────────────────────
if ! command -v mysql &>/dev/null; then
    info "Installing MySQL 8..."
    sudo apt-get install -y mysql-server
    sudo systemctl enable mysql
    sudo systemctl start mysql
fi
info "MySQL: $(mysql --version)"

# ─── 6. MySQL database + user setup ──────────────────────────────────────────
info "Setting up MySQL database and user..."
echo ""
read -rp "Enter MySQL root password (leave empty if not set): " MYSQL_ROOT_PASS
read -rp "Enter new DB name [walldecor_prod]: " DB_NAME
DB_NAME="${DB_NAME:-walldecor_prod}"
read -rp "Enter new DB user [walldecor]: " DB_USER
DB_USER="${DB_USER:-walldecor}"
read -rsp "Enter new DB user password: " DB_PASS
echo ""

if [ -z "$MYSQL_ROOT_PASS" ]; then
    MYSQL_CMD="sudo mysql"
else
    MYSQL_CMD="mysql -uroot -p${MYSQL_ROOT_PASS}"
fi

$MYSQL_CMD <<EOF
CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost' IDENTIFIED BY '${DB_PASS}';
GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
EOF
info "Database '${DB_NAME}' and user '${DB_USER}' created."

# ─── 7. Clone repo ────────────────────────────────────────────────────────────
info "Setting up application directory..."
sudo mkdir -p "$APP_DIR"
sudo chown ubuntu:ubuntu "$APP_DIR"

if [ -d "$APP_DIR/.git" ]; then
    info "Repo already cloned. Pulling latest..."
    git -C "$APP_DIR" pull
else
    info "Cloning repo..."
    git clone "$GITHUB_REPO" "$APP_DIR"
fi

# ─── 8. .env file ─────────────────────────────────────────────────────────────
if [ ! -f "$APP_DIR/.env" ]; then
    info "Creating .env file..."
    NEXTAUTH_SECRET=$(openssl rand -base64 32)
    cat > "$APP_DIR/.env" <<EOF
NEXTAUTH_SECRET=${NEXTAUTH_SECRET}
NEXTAUTH_URL=http://51.83.197.9

DB_TYPE=mysql
DB_HOST=localhost
DB_USER=${DB_USER}
DB_PASSWORD=${DB_PASS}
DB_NAME=${DB_NAME}

DEMO_MODE=false
EOF
    info ".env created at $APP_DIR/.env"
    warn "Remember to update NEXTAUTH_URL when you add a domain!"
else
    warn ".env already exists — skipping. Edit manually if needed."
fi

# ─── 9. Create MySQL schema ────────────────────────────────────────────────────
info "Applying MySQL schema..."
mysql -u"${DB_USER}" -p"${DB_PASS}" "${DB_NAME}" < "$APP_DIR/deploy/schema.mysql.sql"
info "Schema applied."

# ─── 10. private_uploads directory ────────────────────────────────────────────
info "Creating private_uploads directories..."
mkdir -p "$APP_DIR/private_uploads/invoices"
mkdir -p "$APP_DIR/private_uploads/projects"
chmod 750 "$APP_DIR/private_uploads"
info "private_uploads ready."

# ─── 11. Install dependencies + build ─────────────────────────────────────────
info "Installing npm dependencies..."
cd "$APP_DIR"
npm ci --omit=dev

info "Building Next.js app (this may take a few minutes)..."
npm run build

# ─── 12. PM2 start ────────────────────────────────────────────────────────────
info "Starting app with PM2..."
pm2 stop walldecor-portal 2>/dev/null || true
pm2 start "$APP_DIR/ecosystem.config.js"
pm2 save

info "Setting up PM2 startup service..."
pm2 startup | tail -1 | sudo bash
pm2 save

# ─── 13. Nginx config ─────────────────────────────────────────────────────────
info "Configuring Nginx..."
sudo cp "$APP_DIR/deploy/nginx.conf" "$NGINX_CONF"
sudo ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/walldecor
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx

# ─── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}  WallDecor Portal is running!${NC}"
echo -e "${GREEN}  URL: http://51.83.197.9${NC}"
echo -e "${GREEN}  PM2: pm2 status${NC}"
echo -e "${GREEN}  Logs: pm2 logs walldecor-portal${NC}"
echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
warn "NEXT STEP: Create your first ADMIN user:"
echo "  cd $APP_DIR && node scripts/create-admin.js"
echo ""
