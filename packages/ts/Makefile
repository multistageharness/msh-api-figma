##
## @internal/figma-api-module-ts — workspace umbrella Makefile
##
## Aggregate entry point for the TypeScript workspace packages declared in
## package.json `workspaces` (11 today). Tests are plain-ESM suites that import
## each package's BUILT output (see jest.base.config.mjs), so `make test`
## always builds every workspace first — a red run is a real test failure,
## never build staleness. Coverage tracks the workspace list; adding a package
## to `workspaces` needs no Makefile edit. `make install` pins the public
## registry (REGISTRY knob) because the machine's default npm registry may be
## an unreachable local Verdaccio.
##

REGISTRY ?= https://registry.npmjs.org/

.DEFAULT_GOAL := help

.PHONY: help install build typecheck test test-pkg audit clean

help: ## Show this help
	@echo "@internal/figma-api-module-ts workspace targets:"
	@echo "  make test                build every workspace package, then run every test suite"
	@echo "  make test-pkg PKG=<dir>  build + test a single workspace package (e.g. PKG=comments)"
	@echo "  make build               build every workspace package (fresh dist/ + lib/)"
	@echo "  make typecheck           typecheck every workspace package"
	@echo "  make audit               typecheck + test"
	@echo "  make install             npm install (REGISTRY=$(REGISTRY))"
	@echo "  make clean               workspace cleans + remove root node_modules"

install: ## Install/link workspace dependencies (REGISTRY knob overrides the default npm registry)
	npm install --registry=$(REGISTRY)

build: ## Build every workspace package (fresh dist/ + lib/ output)
	npm run build

typecheck: ## Typecheck every workspace package
	npm run typecheck

test: build ## Build every workspace, then run every suite (exit 0 iff all pass)
	npm test

test-pkg: ## Build + test one workspace: make test-pkg PKG=<dir>
	@test -n "$(PKG)" || { echo "usage: make test-pkg PKG=<workspace dir, e.g. comments>"; exit 2; }
	npm run build --workspace=$(PKG)
	npm run test --workspace=$(PKG) --if-present

audit: typecheck test ## typecheck + test

clean: ## Run every workspace's clean, then remove root node_modules
	npm run clean
