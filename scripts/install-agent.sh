#!/usr/bin/env bash
# =========================================================================
# OmniOpener — VM Install Script
# Run this once on the Oracle VM to set up the project.
#
# Usage: curl -sSL <raw-url>/scripts/install-agent.sh | bash
#   or:  ./scripts/install-agent.sh
# =========================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/$(gh api user --jq .login 2>/dev/null || echo 'YOUR_USER')/omni-opener.git}"
INSTALL_DIR="${INSTALL_DIR:-/opt/omniopener}"

echo "🚀 Installing OmniOpener to $INSTALL_DIR"

# Clone or pull repo
if [[ -d "$INSTALL_DIR/.git" ]]; then
  echo "📁 Repo exists, pulling latest..."
  cd "$INSTALL_DIR"
  git pull origin main 2>/dev/null || git pull origin master
else
  echo "📦 Cloning repo..."
  sudo mkdir -p "$INSTALL_DIR"
  sudo chown "$(whoami)" "$INSTALL_DIR"
  git clone "$REPO_URL" "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# Make loop executable
chmod +x agent/loop.sh

# Install jq if missing
if ! command -v jq &> /dev/null; then
  echo "📦 Installing jq..."
  sudo apt-get update -qq && sudo apt-get install -y -qq jq
fi

# Check for Gemini CLI
if ! command -v gemini &> /dev/null; then
  echo "⚠️  Gemini CLI not found. Install it: npm install -g @anthropic-ai/gemini-cli"
  echo "   Or check: https://github.com/google-gemini/gemini-cli"
fi

# Setup Nginx
if command -v nginx &> /dev/null; then
  echo "🌐 Configuring Nginx..."
  sudo cp nginx/omniopener.conf /etc/nginx/sites-available/omniopener.conf
  sudo ln -sf /etc/nginx/sites-available/omniopener.conf /etc/nginx/sites-enabled/
  sudo nginx -t && sudo nginx -s reload
  echo "✅ Nginx configured"
else
  echo "⚠️  Nginx not installed. Install with: sudo apt-get install nginx"
fi

# Setup cron (run loop every boot + daily restart)
echo "⏰ Setting up cron..."
CRON_CMD="@reboot cd $INSTALL_DIR && nohup bash agent/loop.sh >> /var/log/omniopener.log 2>&1 &"
(crontab -l 2>/dev/null | grep -v "omniopener"; echo "$CRON_CMD") | crontab -
echo "✅ Cron set: loop.sh runs on boot"

# Start the loop now
echo ""
echo "🎉 Install complete!"
echo ""
echo "To start the agentic loop now:"
echo "  cd $INSTALL_DIR && nohup bash agent/loop.sh >> /var/log/omniopener.log 2>&1 &"
echo ""
echo "To monitor:"
echo "  tail -f /var/log/omniopener.log"
echo ""
echo "To give instructions:"
echo "  echo 'Fix the CSV tool color scheme' > $INSTALL_DIR/agent/INSTRUCTIONS.md"
echo "  cd $INSTALL_DIR && git add -A && git commit -m 'instruction' && git push"
