# Makefile for OctopPet
# Usage:
#   make              - Show this help
#   make all          - format-all + lint + typecheck + test (ship bar / pre-commit)
#   make check        - lint + typecheck + test (CI, no auto-format)
#   make install-hooks - Point git to .githooks (pre-commit runs make all)
#
# Prerequisites:
#   - Node.js + npm
#   - Rust (rustup) + cargo
#   - Tauri platform deps: https://tauri.app/start/prerequisites/

SHELL := /bin/bash
.DEFAULT_GOAL := help

REPO_ROOT := $(shell pwd)
TAURI_DIR := $(REPO_ROOT)/src-tauri

.PHONY: help
help:
	@echo "OctopPet Build System"
	@echo ""
	@echo "Usage: make <target>"
	@echo ""
	@echo "Development:"
	@echo "  install          npm install"
	@echo "  dev              npm run tauri dev"
	@echo "  build            npm run tauri build"
	@echo ""
	@echo "Quality (ship bar):"
	@echo "  all              format-all + lint + typecheck + test"
	@echo "  check            lint + typecheck + test (CI, no auto-format)"
	@echo "  lint             lint-rust + lint-frontend"
	@echo "  format           format-rust + format-frontend"
	@echo "  typecheck        tsc --noEmit + cargo check"
	@echo "  test             vitest + cargo test"
	@echo ""
	@echo "Quality (Rust):"
	@echo "  lint-rust        cargo fmt --check + clippy -D warnings"
	@echo "  format-rust      cargo fmt"
	@echo ""
	@echo "Quality (frontend):"
	@echo "  lint-frontend    prettier --check + eslint"
	@echo "  format-frontend  prettier --write"
	@echo ""
	@echo "Utility:"
	@echo "  install-hooks    Point git to .githooks (pre-commit: make all)"
	@echo "  sync-version     Sync version (VERSION=0.2.0)"
	@echo "  coverage         vitest coverage"
	@echo "  clean            Remove dist / target debug artifacts"

.PHONY: install
install:
	npm install

.PHONY: dev
dev:
	npm run tauri dev

.PHONY: build
build:
	npm run tauri build

.PHONY: test
test:
	npm test
	cd "$(TAURI_DIR)" && cargo test

.PHONY: coverage
coverage:
	npm run test:coverage

.PHONY: sync-version
sync-version:
	@test -n "$(VERSION)" || (echo "Usage: make sync-version VERSION=0.2.0" && exit 1)
	node scripts/sync-version.mjs $(VERSION)

.PHONY: typecheck
typecheck:
	npx tsc --noEmit
	cd "$(TAURI_DIR)" && cargo check

.PHONY: format-rust
format-rust:
	cd "$(TAURI_DIR)" && cargo fmt

.PHONY: lint-rust
lint-rust:
	@echo "[lint-rust] cargo fmt --check"
	cd "$(TAURI_DIR)" && cargo fmt --check
	@echo "[lint-rust] cargo clippy"
	cd "$(TAURI_DIR)" && cargo clippy -- -D warnings

.PHONY: format-frontend
format-frontend:
	@echo "[format-frontend] prettier --write"
	npx prettier --write .

.PHONY: lint-frontend
lint-frontend:
	@echo "[lint-frontend] prettier --check"
	npx prettier --check .
	@echo "[lint-frontend] eslint"
	npm run lint

.PHONY: format-all
format-all: format-rust format-frontend

.PHONY: lint-all
lint-all: lint-rust lint-frontend

.PHONY: lint
lint: lint-all

.PHONY: format
format: format-all

.PHONY: all
all: format-all lint typecheck test

.PHONY: check
check: lint typecheck test

.PHONY: install-hooks
install-hooks:
	@echo "[install-hooks] Setting core.hooksPath=.githooks"
	git config core.hooksPath .githooks
	@chmod +x "$(REPO_ROOT)/.githooks/"* 2>/dev/null || true
	@echo "[install-hooks] Done. Pre-commit runs: make all (format + lint + typecheck + test)"
	@echo "[install-hooks] Bypass: SKIP_PRECOMMIT=1 git commit …   or   git commit --no-verify"

.PHONY: clean
clean:
	rm -rf dist coverage
	cd "$(TAURI_DIR)" && cargo clean
