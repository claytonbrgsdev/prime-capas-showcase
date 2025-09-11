#!/usr/bin/env bash
set -euo pipefail

# Simple dev server for static HTML/CSS/JS
# Priority: python3 http.server -> python SimpleHTTPServer -> php -S -> npx http-server
# Usage:
#   ./dev.sh                # serve on http://127.0.0.1:5173
#   PORT=8080 HOST=0.0.0.0 ./dev.sh
#   OPEN_BROWSER=0 ./dev.sh # do not auto-open browser
#   ./dev.sh 8080           # port as first arg

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

PORT="${PORT:-5173}"
HOST="${HOST:-127.0.0.1}"
OPEN_BROWSER="${OPEN_BROWSER:-1}"

if [[ $# -ge 1 ]]; then
  PORT="$1"
fi

command_exists() { command -v "$1" >/dev/null 2>&1; }

is_port_free() {
  local host="$1" port="$2"
  if command_exists lsof; then
    ! lsof -iTCP:"$port" -sTCP:LISTEN -Pn | grep -q "LISTEN"
  elif command_exists nc; then
    ! nc -z "$host" "$port" >/dev/null 2>&1
  else
    # Best effort if neither tool is available
    return 0
  fi
}

choose_free_port() {
  local start_port="$1" host="$2" max_tries=50
  local try_port="$start_port"
  for _ in $(seq 0 "$max_tries"); do
    if is_port_free "$host" "$try_port"; then
      echo "$try_port"
      return 0
    fi
    try_port=$((try_port + 1))
  done
  echo "$start_port"
}

open_url() {
  local url="http://$HOST:$PORT"
  if [[ "$OPEN_BROWSER" == "1" ]]; then
    if command_exists open; then open "$url"; elif command_exists xdg-open; then xdg-open "$url"; else echo "Open your browser at $url"; fi
  else
    echo "Server running at $url"
  fi
}

start_and_wait() {
  local pid="$1"
  trap 'kill "$pid" >/dev/null 2>&1 || true' EXIT INT TERM
  # Give the server a moment to start
  sleep 0.4
  open_url
  wait "$pid"
}

PORT="$(choose_free_port "$PORT" "$HOST")"

echo "Serving directory: $SCRIPT_DIR"
echo "Host: $HOST  Port: $PORT"

if command_exists python3; then
  echo "Using: python3 -m http.server"
  python3 -m http.server "$PORT" --bind "$HOST" &
  start_and_wait $!
elif command_exists python; then
  echo "Using: python -m SimpleHTTPServer"
  # python 2 does not support binding host easily; will listen on 0.0.0.0
  python -m SimpleHTTPServer "$PORT" &
  start_and_wait $!
elif command_exists php; then
  echo "Using: php -S"
  php -S "$HOST:$PORT" &
  start_and_wait $!
elif command_exists npx; then
  echo "Using: npx http-server"
  npx --yes http-server -a "$HOST" -p "$PORT" -c-1 . &
  start_and_wait $!
else
  echo "No suitable static server found. Install Python 3, PHP, or Node.js (for npx http-server)." >&2
  exit 1
fi


