#!/usr/bin/env bash
# Pre-commit hook for Architecture Enforcement (install: cp scripts/enforcement/pre-commit.sh .git/hooks/pre-commit)
set -euo pipefail
cd "$(git rev-parse --show-toplevel)/primecare-portal"
echo "[architecture-enforcement] pre-commit profile..."
node scripts/enforcement/run-architecture-enforcement.mjs --profile pre-commit
