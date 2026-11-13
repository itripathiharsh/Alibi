#!/usr/bin/env bash
# ALIBI Environment Doctor (Bash / Linux / CI)
set -eo pipefail

echo "============================================================"
echo "          ALIBI Environment Doctor (Linux / CI)             "
echo "============================================================"

FAILED=0

# OS
echo "[OK]   OS: $(uname -s) $(uname -r) ($(uname -m))"

# Python 3.12 & uv
if command -v uv >/dev/null 2>&1; then
    echo "[OK]   uv: $(uv --version)"
    if uv run --python 3.12 python --version >/dev/null 2>&1; then
        echo "[OK]   Python: $(uv run --python 3.12 python --version)"
    else
        echo "[FAIL] Python 3.12 via uv not found"
        FAILED=1
    fi
else
    echo "[FAIL] uv not found"
    FAILED=1
fi

# Node & pnpm
if command -v node >/dev/null 2>&1; then
    NODE_V=$(node -v)
    if [[ "$NODE_V" =~ ^v22\. ]]; then
        echo "[OK]   Node.js: $NODE_V (Node 22 LTS)"
    else
        echo "[FAIL] Node.js: $NODE_V (Expected Node 22 LTS)"
        FAILED=1
    fi
else
    echo "[FAIL] node not found"
    FAILED=1
fi

if command -v pnpm >/dev/null 2>&1; then
    echo "[OK]   pnpm: $(pnpm -v)"
else
    echo "[FAIL] pnpm not found"
    FAILED=1
fi

# Java 17
if command -v java >/dev/null 2>&1; then
    JAVA_V=$(java -version 2>&1 | head -n 1)
    if [[ "$JAVA_V" =~ 17\. ]]; then
        echo "[OK]   Java: $JAVA_V"
    else
        echo "[FAIL] Java: $JAVA_V (Expected Java 17)"
        FAILED=1
    fi
else
    echo "[FAIL] java not found"
    FAILED=1
fi

# Docker
if command -v docker >/dev/null 2>&1; then
    echo "[OK]   Docker: $(docker --version)"
else
    echo "[WARN] docker CLI not found"
fi

echo "============================================================"
if [ "$FAILED" -eq 0 ]; then
    echo "Doctor check PASSED"
    exit 0
else
    echo "Doctor check FAILED"
    exit 1
fi
