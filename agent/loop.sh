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

is_reperfected() {
  jq -e --arg f "$1" '.reperfected // [] | index($f)' "$STATE" > /dev/null 2>&1
}

mark_reperfected() {
  local tmp; tmp=$(mktemp)
  jq --arg f "$1" '.reperfected = ((.reperfected // []) + [$f])' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
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
# Distinguishes two failure modes:
#   - Per-minute rate limit (429): exponential backoff, max 5 retries
#   - Daily quota exhausted:       sleep 1 hour and retry indefinitely
#                                  (quota resets daily — never mark as failed)
call_gemini() {
  local prompt="$1"
  local attempt=1
  local backoff=60
  local result

  while true; do
    log "🤖 Calling Gemini (Attempt $attempt)..."
    result=$(gemini -p "$prompt" --yolo 2>&1 || true)

    # Daily quota exhausted — sleep 1h and retry indefinitely
    if echo "$result" | grep -qiE "(quota exceeded|resource.?exhausted|daily.?limit|user.?rate.?limit|you have exceeded|RESOURCE_EXHAUSTED)"; then
      warn "🛑 Daily quota exhausted! Sleeping 1 hour before retrying..."
      echo "$result" | tail -n 3 | sed 's/^/   | /'
      sleep 3600
      attempt=$((attempt + 1))
      continue
    fi

    # Per-minute rate limit or transient error — exponential backoff, max 5 tries
    if echo "$result" | grep -qiE "(429|too many requests|rate.?limit|bad file descriptor|unexpected critical error|error: internal|UNAVAILABLE|overloaded)"; then
      warn "⚠️  Rate limit / transient error (Attempt $attempt)"
      echo "$result" | tail -n 3 | sed 's/^/   | /'
      if [[ $attempt -ge 5 ]]; then
        err "❌ Gemini transient errors persist after 5 attempts."
        echo "$result"
        return 1
      fi
      warn "⏳ Sleeping ${backoff}s before retrying..."
      sleep $backoff
      attempt=$((attempt + 1))
      backoff=$((backoff * 2))
      continue
    fi

    # Success
    echo "$result"
    return 0
  done
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
  # Regenerate sitemap and pre-render tool pages after deploy
  if [[ -f "$ROOT/scripts/generate-sitemap.js" ]]; then
    node "$ROOT/scripts/generate-sitemap.js" 2>/dev/null || true
  fi
  if [[ -f "$ROOT/scripts/prerender.js" ]]; then
    node "$ROOT/scripts/prerender.js" 2>/dev/null || true
  fi
  git add public/sitemap.xml public/tools/*/index.html 2>/dev/null
  git diff --cached --quiet || git commit -m "chore: update sitemap and pre-rendered pages [automated]" && git push origin main 2>/dev/null || true
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


# ── Retry Failed Formats ──────────────────────────────────
# Clears failed status for formats that failed >24h ago and retries them
retry_failed() {
  local tmp; tmp=$(mktemp)
  # Pull out failed formats and clear them from state
  local failed_formats
  failed_formats=$(jq -r '.failed[].format' "$STATE" 2>/dev/null || true)
  if [[ -z "$failed_formats" ]]; then return 0; fi

  log "♻️  Retrying previously failed formats: $(echo $failed_formats | tr '\n' ' ')"
  # Clear all failed entries so they get reprocessed
  jq '.failed = []' "$STATE" > "$tmp" && mv "$tmp" "$STATE"
}

# ── Discover New Formats via Gemini ───────────────────────
# When queue is fully done, ask Gemini to suggest new file formats
discover_formats() {
  log "🔭 Discovering new file formats to build..."

  local existing
  existing=$(cut -d, -f1 "$QUEUE" | tr '\n' ',' | sed 's/,$//')

  local discover_prompt="You are working on OmniOpener at $ROOT, a browser-based file utility that opens any file format client-side. We already support these formats: $existing. Your task: suggest exactly 20 new file format extensions we should add next. Focus on formats that are useful, have clear viewing/parsing value in a browser, and are NOT already in the list above. Consider: lesser-known document formats, scientific data formats, developer config formats, CAD/GIS formats, game asset formats, database dumps, font files, etc. Output ONLY a plain list — one format extension per line, no dots, no explanations, no numbering. Just the raw extension like: epub"

  local result
  result=$(call_gemini "$discover_prompt") || return 1

  local added=0
  while IFS= read -r fmt; do
    fmt=$(echo "$fmt" | tr -d '[:space:].' | tr '[:upper:]' '[:lower:]')
    [[ -z "$fmt" || ${#fmt} -gt 10 ]] && continue
    # Skip if already in queue
    if grep -qi "^${fmt}$" "$QUEUE" 2>/dev/null; then continue; fi
    # Skip if already built
    if is_built "$fmt"; then continue; fi
    echo "$fmt" >> "$QUEUE"
    log "  ➕ Added to queue: $fmt"
    added=$((added + 1))
  done <<< "$result"

  if [[ $added -gt 0 ]]; then
    ok "🆕 Discovered and queued $added new formats"
    # Commit the updated queue
    cd "$ROOT"
    git add agent/queue.csv
    git commit -m "chore: auto-discover $added new formats to build [automated]" || true
    git push origin main 2>&1 || true
  else
    warn "No new formats discovered this round"
  fi
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
      # Queue exhausted — re-perfect any built tools not yet through the new prompts
      local reperfect_format=""
      while IFS=, read -r format _rest; do
        format=$(echo "$format" | tr -d '[:space:]' | tr '[:upper:]' '[:lower:]')
        [[ -z "$format" || "$format" == "format" ]] && continue
        if is_built "$format" && ! is_reperfected "$format"; then
          reperfect_format="$format"
          break
        fi
      done < "$QUEUE"

      if [[ -n "$reperfect_format" ]]; then
        log "🔁 Re-perfecting existing tool: $reperfect_format"
        perfect_tool "$reperfect_format"
        if validate_tool "$reperfect_format"; then
          mark_reperfected "$reperfect_format"
          commit_and_push "$reperfect_format"
          ok "✅ Re-perfected and deployed: $reperfect_format"
        else
          warn "Re-perfection broke $reperfect_format — running improve and marking done anyway"
          improve_tool "$reperfect_format"
          mark_reperfected "$reperfect_format"
          commit_and_push "$reperfect_format"
        fi
        sleep $SLEEP_BETWEEN
        continue
      fi

      ok "🎉 All formats built and re-perfected!"
      # Retry any formats that previously failed
      retry_failed
      # Ask Gemini to discover new formats and add to queue
      discover_formats
      log "😴 Sleeping 5 minutes before next discovery cycle..."
      sleep 300
      continue
    fi

    process_format "$next_format" || true
    log "😴 Sleeping ${SLEEP_BETWEEN}s before next format..."
    sleep $SLEEP_BETWEEN
  done
}

main "$@"
