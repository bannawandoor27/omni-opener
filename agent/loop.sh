#!/usr/bin/env bash
# =========================================================================
# OmniOpener — Agentic Generation Loop
# Runs on the Oracle VM. Continuously generates, validates, and deploys
# new file-format tools using the Gemini CLI.
#
# Usage:  ./agent/loop.sh                  (runs forever)
#         FORMAT=csv ./agent/loop.sh       (one-shot for a specific format)
# =========================================================================
set -euo pipefail

# Load nvm so `gemini` is in PATH (needed for non-interactive/cron execution)
export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
QUEUE="$ROOT/agent/queue.csv"
STATE="$ROOT/agent/state.json"
INSTRUCTIONS="$ROOT/agent/INSTRUCTIONS.md"
CONFIG="$ROOT/public/config.json"
TOOLS_DIR="$ROOT/public/tools"
PROMPTS_DIR="$ROOT/agent/prompts"
MAX_RETRIES=3
SLEEP_BETWEEN=60

# ── Colors ────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
log()  { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $1"; }
ok()   { echo -e "${GREEN}[✓]${NC} $1"; }
warn() { echo -e "${YELLOW}[!]${NC} $1"; }
err()  { echo -e "${RED}[✗]${NC} $1"; }

# ── State Management ─────────────────────────────────────
init_state() {
  if [[ ! -f "$STATE" ]]; then
    echo '{"built":[],"failed":[],"skipped":[],"last_run":""}' > "$STATE"
  fi
}

is_built() {
  jq -e --arg f "$1" '.built | index($f)' "$STATE" > /dev/null 2>&1
}

is_failed() {
  jq -e --arg f "$1" '[.failed[].format] | index($f)' "$STATE" > /dev/null 2>&1
}

mark_built() {
  local tmp=$(mktemp)
  jq --arg f "$1" --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '.built += [$f] | .last_run = $t' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
}

mark_failed() {
  local tmp=$(mktemp)
  jq --arg f "$1" --arg r "$2" \
    '.failed += [{"format": $f, "reason": $r}]' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
}

# ── Resilient Gemini Execution ────────────────────────────
call_gemini() {
  local prompt="$1"
  local max_api_retries=5
  local attempt=1
  local backoff=60
  local result

  while [[ $attempt -le $max_api_retries ]]; do
    log "🤖 Calling Gemini (Attempt $attempt/$max_api_retries)..."
    result=$(gemini -p "$prompt" --yolo 2>&1 || true)
    
    # Check for throttling (429), quota limits, or other transient errors
    if echo "$result" | grep -qiE "(429 too many requests|quota exceeded|ratelimit|rate limit|bad file descriptor|unexpected critical error|error: internal)"; then
      warn "⚠️  API Error or Throttling detected! (Attempt $attempt/$max_api_retries)"
      # print the error lines nicely for logging
      echo "$result" | tail -n 3 | sed 's/^/   | /'
      if [[ $attempt -eq $max_api_retries ]]; then break; fi
      warn "⏳ Sleeping for ${backoff}s before retrying..."
      sleep $backoff
      attempt=$((attempt + 1))
      backoff=$((backoff * 2))
    else
      # Output result for caller
      echo "$result"
      return 0
    fi
  done
  
  err "❌ Gemini API failed completely after $max_api_retries attempts."
  echo "$result"
  return 1
}

# ── Instructions Check ───────────────────────────────────
check_instructions() {
  if [[ -f "$INSTRUCTIONS" ]] && [[ -s "$INSTRUCTIONS" ]]; then
    local content
    content=$(cat "$INSTRUCTIONS")
    if [[ -n "${content// /}" ]]; then
      log "📋 Found human instructions. Passing to Gemini..."
      call_gemini "You are working on OmniOpener, a client-side file utility SPA. The project root is at $ROOT. Here are instructions from the developer: $content. Execute these instructions now. Make any necessary changes to files." > /dev/null
      # Clear instructions after acting on them (truncate to 0 bytes)
      truncate -s 0 "$INSTRUCTIONS"
      ok "Instructions processed and cleared."
    fi
  fi
}

# ── Generate Tool ─────────────────────────────────────────
generate_tool() {
  local format="$1"
  local slug="${format}-opener"
  local script_path="$TOOLS_DIR/${slug}.js"

  log "🔨 Generating tool for: $format"

  local generate_prompt
  generate_prompt=$(cat "$PROMPTS_DIR/generate.txt" | sed "s/{{FORMAT}}/$format/g" | sed "s|{{SCRIPT_PATH}}|$script_path|g" | sed "s|{{ROOT}}|$ROOT|g")

  call_gemini "$generate_prompt" > /dev/null

  if [[ ! -f "$script_path" ]]; then
    err "Script file not created: $script_path"
    return 1
  fi

  ok "Generated: $script_path"
}

# ── Validate Tool ─────────────────────────────────────────
validate_tool() {
  local format="$1"
  local slug="${format}-opener"
  local script_path="$TOOLS_DIR/${slug}.js"

  log "🔍 Validating: $slug"

  local validate_prompt
  validate_prompt=$(cat "$PROMPTS_DIR/validate.txt" | sed "s/{{FORMAT}}/$format/g" | sed "s|{{SCRIPT_PATH}}|$script_path|g" | sed "s|{{ROOT}}|$ROOT|g")

  local result
  result=$(call_gemini "$validate_prompt")

  if echo "$result" | grep -qi "PASS"; then
    ok "Validation passed for $slug"
    return 0
  else
    warn "Validation failed for $slug"
    return 1
  fi
}

# ── Improve Tool ──────────────────────────────────────────
improve_tool() {
  local format="$1"
  local slug="${format}-opener"
  local script_path="$TOOLS_DIR/${slug}.js"

  log "🔧 Improving: $slug"

  local improve_prompt
  improve_prompt=$(cat "$PROMPTS_DIR/improve.txt" | sed "s/{{FORMAT}}/$format/g" | sed "s|{{SCRIPT_PATH}}|$script_path|g" | sed "s|{{ROOT}}|$ROOT|g")

  call_gemini "$improve_prompt" > /dev/null
}

# ── Perfect Tool ──────────────────────────────────────────
perfect_tool() {
  local format="$1"
  local slug="${format}-opener"
  local script_path="$TOOLS_DIR/${slug}.js"

  log "✨ Perfecting: $slug (Deep Iteration)"

  local perfect_prompt
  perfect_prompt=$(cat "$PROMPTS_DIR/perfect.txt" | sed "s/{{FORMAT}}/$format/g" | sed "s|{{SCRIPT_PATH}}|$script_path|g" | sed "s|{{ROOT}}|$ROOT|g")

  call_gemini "$perfect_prompt" > /dev/null
}

# ── Syntax Check ──────────────────────────────────────────
syntax_check() {
  local format="$1"
  local script_path="$TOOLS_DIR/${format}-opener.js"
  log "🔎 Syntax checking: ${format}-opener.js"
  if node --check "$script_path" 2>/dev/null; then
    ok "Syntax OK"
    return 0
  else
    warn "Syntax error detected:"
    node --check "$script_path" 2>&1 | head -5 | sed 's/^/   | /'
    return 1
  fi
}

# ── Format Metadata Helpers ───────────────────────────────
get_icon() {
  case "$1" in
    pdf|docx|doc|odt|rtf|pptx|ppt|odp) echo "📄" ;;
    xlsx|xls|ods|csv|tsv) echo "📊" ;;
    json|yaml|yml|xml|toml|ini|graphql|proto|sql) echo "🔧" ;;
    zip|tar|gz|bz2|xz|7z|rar|iso|dmg) echo "📦" ;;
    deb|rpm|snap|flatpak|appimage|jar|war|apk|ipa|whl|egg|gem|nupkg|crate) echo "📦" ;;
    mp3|wav|ogg|flac|aac|midi|mid) echo "🎵" ;;
    mp4|webm|avi|mkv|mov|m4v|m3u8) echo "🎬" ;;
    svg|webp|avif|heic|tiff|bmp|ico|gif|png|jpg|jpeg|apng) echo "🖼️" ;;
    geojson|kml|gpx) echo "🗺️" ;;
    stl|glb|gltf|obj|step|iges|dxf|dwg) echo "🧊" ;;
    eml|mbox) echo "📧" ;;
    log|txt|md) echo "📋" ;;
    ics) echo "📅" ;;
    vcf) echo "👤" ;;
    pem|crt|key) echo "🔐" ;;
    wasm|exe|msi|dll|so|dylib) echo "⚙️" ;;
    srt|vtt|ass|lrc) echo "💬" ;;
    psd|ai|fig|xd|sketch) echo "🎨" ;;
    *) echo "📁" ;;
  esac
}

get_category() {
  case "$1" in
    pdf|docx|doc|odt|rtf|pptx|ppt|odp) echo "documents" ;;
    xlsx|xls|ods) echo "spreadsheets" ;;
    csv|tsv|json|yaml|yml|xml|toml|ini|sql|graphql|proto) echo "data" ;;
    zip|tar|gz|bz2|xz|7z|rar|iso|dmg) echo "archives" ;;
    deb|rpm|snap|flatpak|appimage|jar|war|apk|ipa|whl|egg|gem|nupkg|crate) echo "packages" ;;
    mp3|wav|ogg|flac|aac|midi|mid) echo "audio" ;;
    mp4|webm|avi|mkv|mov|m4v|m3u8) echo "video" ;;
    svg|webp|avif|heic|tiff|bmp|ico|gif|png|jpg|jpeg|apng) echo "images" ;;
    geojson|kml|gpx) echo "geo" ;;
    stl|glb|gltf|obj|step|iges|dxf|dwg|eps) echo "3d" ;;
    eml|mbox) echo "email" ;;
    log|txt|md|srt|vtt|ass|lrc) echo "text" ;;
    ics|vcf) echo "calendar" ;;
    pem|crt|key) echo "security" ;;
    wasm|exe|msi|dll|so|dylib) echo "system" ;;
    psd|ai|fig|xd|sketch) echo "design" ;;
    *) echo "general" ;;
  esac
}

get_extensions() {
  case "$1" in
    yaml) echo ".yaml,.yml" ;;
    jpg)  echo ".jpg,.jpeg" ;;
    tar)  echo ".tar,.tar.gz,.tgz" ;;
    midi) echo ".mid,.midi" ;;
    gz)   echo ".gz,.gzip" ;;
    mp4)  echo ".mp4,.m4v" ;;
    *) echo ".$1" ;;
  esac
}

# ── Update Config (using jq, NOT Gemini) ──────────────────
update_config() {
  local format="$1"
  local slug="${format}-opener"
  local icon; icon=$(get_icon "$format")
  local category; category=$(get_category "$format")
  local extensions; extensions=$(get_extensions "$format")
  local title="${format^^} Opener"
  local h1="Open & View .${format} Files Online — Free & Private"
  local meta="Open, view, and convert .${format} files in your browser. No uploads, no installs — 100% private, runs entirely client-side."

  log "📝 Updating config.json for: $slug ($icon $category)"

  # Check if slug already exists
  if jq -e --arg s "$slug" '.tools[] | select(.slug == $s)' "$CONFIG" > /dev/null 2>&1; then
    warn "Slug $slug already in config, skipping."
    return 0
  fi

  # Build formats array from comma-separated extensions string
  local formats_json
  formats_json=$(echo "$extensions" | tr ',' '\n' | jq -R . | jq -s .)

  local tmp; tmp=$(mktemp)
  jq --arg slug "$slug" \
     --arg title "$title" \
     --arg h1 "$h1" \
     --arg meta "$meta" \
     --arg category "$category" \
     --arg icon "$icon" \
     --arg script "/tools/${slug}.js" \
     --argjson formats "$formats_json" \
    '.tools += [{
      "slug": $slug,
      "title": $title,
      "h1": $h1,
      "meta_description": $meta,
      "formats": $formats,
      "category": $category,
      "icon": $icon,
      "script_url": $script
    }]' "$CONFIG" > "$tmp" && mv "$tmp" "$CONFIG" && chmod 644 "$CONFIG"

  ok "Config updated for $slug"
}

# ── Git Commit & Push ─────────────────────────────────────
commit_and_push() {
  local format="$1"
  cd "$ROOT"
  git add -A
  git commit -m "feat: add ${format}-opener tool [automated]" || true
  git push origin main 2>&1 || git push origin master 2>&1
  ok "Pushed to GitHub"
}

# ── Process One Format ────────────────────────────────────
process_format() {
  local format="$1"
  local retries=0

  if is_built "$format"; then
    log "⏭️  Already built: $format — skipping"
    return 0
  fi

  generate_tool "$format"

  # Fast syntax check — catch JS parse errors before wasting Gemini API calls
  if ! syntax_check "$format"; then
    warn "Syntax errors found, running improvement pass before validation..."
    improve_tool "$format"
  fi

  while [[ $retries -lt $MAX_RETRIES ]]; do
    if validate_tool "$format"; then
      
      # Deep Iteration Phase (run twice for feedback loop)
      perfect_tool "$format"
      perfect_tool "$format"
      
      # Final validation before deploying to ensure perfection didnt break SDK rules
      if ! validate_tool "$format"; then
         warn "Perfection phase broke the tool SDK rules! Reverting to improvement loop..."
         improve_tool "$format"
         continue
      fi

      update_config "$format"
      mark_built "$format"
      commit_and_push "$format"
      ok "✅ Successfully deployed: $format"
      return 0
    fi

    retries=$((retries + 1))
    warn "Retry $retries/$MAX_RETRIES for $format"
    improve_tool "$format"
  done

  err "Failed after $MAX_RETRIES retries: $format"
  mark_failed "$format" "exceeded max retries"
  return 1
}

# ── Main Loop ─────────────────────────────────────────────
main() {
  init_state
  log "🚀 OmniOpener Agentic Loop started"
  log "   Root:    $ROOT"
  log "   Queue:   $QUEUE"
  log "   State:   $STATE"

  # One-shot mode
  if [[ -n "${FORMAT:-}" ]]; then
    log "🎯 One-shot mode for: $FORMAT"
    check_instructions
    process_format "$FORMAT"
    return $?
  fi

  # Continuous loop mode
  while true; do
    check_instructions

    # Read next format from queue
    local next_format=""
    while IFS=, read -r format _rest; do
      format=$(echo "$format" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
      [[ -z "$format" || "$format" == "format" ]] && continue  # skip header/empty
      if ! is_built "$format" && ! is_failed "$format"; then
        next_format="$format"
        break
      fi
    done < "$QUEUE"

    if [[ -z "$next_format" ]]; then
      ok "🎉 All formats in queue have been processed!"
      log "Sleeping 1 hour before re-checking queue..."
      sleep 3600
      continue
    fi

    process_format "$next_format" || true
    log "😴 Sleeping ${SLEEP_BETWEEN}s before next format..."
    sleep $SLEEP_BETWEEN
  done
}

main "$@"
