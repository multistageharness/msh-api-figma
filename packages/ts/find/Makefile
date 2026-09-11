##
## @internal/figma-find-api — self-contained Makefile
##
## Distribution point for the `figma-find` CLI inside this monorepo. The engine
## lives in @internal/figma-find (msh-sdk-figma-find); this package only owns
## the bin entry and the re-export, so `build` is a single tsc pass and `test`
## is a smoke test that the binary actually runs.
##

.DEFAULT_GOAL := help

.PHONY: help install build typecheck test audit run clean

help: ## Show this help
	@echo "@internal/figma-find-api targets:"
	@echo "  make build       compile src/ to lib/"
	@echo "  make test        smoke-test the built binary"
	@echo "  make typecheck   typecheck every source file"
	@echo "  make run         run the CLI (lib/cli.js; needs make build first)"
	@echo "  make install     npm install"
	@echo "  make audit       typecheck + test"
	@echo "  make clean       remove build output"

install: ## Install/link dependencies
	npm install

build: ## Compile src/ to lib/
	npm run build

typecheck: ## Typecheck every source file
	npm run typecheck

test: ## Smoke-test the built binary
	npm test

run: ## Run the CLI (needs make build first)
	node lib/cli.js

audit: typecheck test ## typecheck + test

clean: ## Remove build output
	npm run clean
