#!/usr/bin/env bash
# ALIBI Environment Doctor (Bash / Linux / CI)
set -eo pipefail

echo "============================================================"
echo "          ALIBI Environment Doctor (Linux / CI)             "
echo "============================================================"

FAILED=0

# OS & Architecture
echo "[OK]   OS: $(uname -s) $(uname -r) ($(uname -m))"

# Hardware checks (RAM & CPU)
if [ -f /proc/meminfo ]; then
    TOTAL_RAM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
    TOTAL_RAM_GB=$(( TOTAL_RAM_KB / 1024 / 1024 ))
    FREE_RAM_KB=$(grep MemAvailable /proc/meminfo | awk '{print $2}')
    FREE_RAM_GB=$(( FREE_RAM_KB / 1024 / 1024 ))
    echo "[OK]   RAM: ${TOTAL_RAM_GB} GB total (${FREE_RAM_GB} GB available)"
fi

if [ -f /proc/cpuinfo ]; then
    CORES=$(grep -c ^processor /proc/cpuinfo)
    MODEL=$(grep 'model name' /proc/cpuinfo | head -n 1 | cut -d: -f2 | xargs)
    echo "[OK]   CPU: $MODEL ($CORES vCPUs)"
fi

# Ports (8000, 3000, 5433, 5432 host check)
echo ""
echo "--- Network Ports ---"
for PORT in 8000 3000 5433; do
    if command -v ss >/dev/null 2>&1; then
        if ss -tuln | grep -q ":$PORT "; then
            echo "[INFO] Port $PORT: In use"
        else
            echo "[OK]   Port $PORT: Available"
        fi
    fi
done

if command -v ss >/dev/null 2>&1 && ss -tuln | grep -q ":5432 "; then
    echo "[WARN] Port 5432 in use by host service. Compose uses port 5433 (POSTGRES_HOST_PORT=5433)."
fi

# Python 3.12 & uv
echo ""
echo "--- Development Tooling ---"
if command -v uv >/dev/null 2>&1; then
    UV_VER=$(uv --version)
    UV_PATH=$(command -v uv)
    echo "[OK]   uv: $UV_VER ($UV_PATH)"
    if uv run --python 3.12 python --version >/dev/null 2>&1; then
        echo "[OK]   Python 3.12 (via uv): $(uv run --python 3.12 python --version)"
    else
        echo "[FAIL] Python 3.12 via uv not found"
        echo "       Hint: Run 'uv python install 3.12'"
        FAILED=1
    fi
else
    echo "[FAIL] uv not found"
    echo "       Hint: Install via https://docs.astral.sh/uv/"
    FAILED=1
fi

# Node & pnpm
if command -v node >/dev/null 2>&1; then
    NODE_V=$(node -v)
    if [[ "$NODE_V" =~ ^v22\. ]]; then
        echo "[OK]   Node.js: $NODE_V (Node 22 LTS)"
    else
        echo "[FAIL] Node.js: $NODE_V (Expected Node 22 LTS)"
        echo "       Hint: Install Node 22 LTS"
        FAILED=1
    fi
else
    echo "[FAIL] node not found"
    echo "       Hint: Install Node 22 LTS"
    FAILED=1
fi

if command -v pnpm >/dev/null 2>&1; then
    echo "[OK]   pnpm: $(pnpm -v)"
else
    echo "[FAIL] pnpm not found"
    echo "       Hint: Run 'corepack enable pnpm'"
    FAILED=1
fi

# Java 17
if command -v java >/dev/null 2>&1; then
    JAVA_V=$(java -version 2>&1 | head -n 1)
    if [[ "$JAVA_V" =~ 17\. ]]; then
        echo "[OK]   Java: $JAVA_V"
    else
        echo "[FAIL] Java: $JAVA_V (Expected Java 17)"
        echo "       Hint: Install OpenJDK 17 and configure JAVA_HOME"
        FAILED=1
    fi
else
    echo "[FAIL] java not found"
    echo "       Hint: Install OpenJDK 17 and configure JAVA_HOME"
    FAILED=1
fi

# Docker (Required)
if command -v docker >/dev/null 2>&1; then
    echo "[OK]   Docker: $(docker --version)"
    if docker compose version >/dev/null 2>&1; then
        echo "[OK]   Docker Compose: $(docker compose version)"
    else
        echo "[FAIL] Docker Compose not found"
        FAILED=1
    fi
else
    echo "[FAIL] Docker not found"
    echo "       Hint: Install Docker Engine / Docker Desktop"
    FAILED=1
fi

echo "============================================================"
if [ "$FAILED" -eq 0 ]; then
    echo "Doctor check PASSED"
    exit 0
else
    echo "Doctor check FAILED"
    exit 1
fi
