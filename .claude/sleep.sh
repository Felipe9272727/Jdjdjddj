#!/usr/bin/env bash
# sleep.sh — imprime o estado atual da memória consolidada
# Claude lê isso antes de cada tarefa grande ("acordar")
echo "=== MEMÓRIA CONSOLIDADA ==="
cat "$(dirname "$0")/memory.json"
echo ""
echo "=== GIT STATUS ==="
git -C "$(dirname "$0")/.." log --oneline -5
