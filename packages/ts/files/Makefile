##
## @internal/figma-files-api — self-contained Makefile
##
## Node.js client for Figma Files API
##

.DEFAULT_GOAL := help

.PHONY: help install typecheck test audit run clean

help: ## Show this help
	@echo "@internal/figma-files-api targets:"
	@echo "  make test        run the test suite"
	@echo "  make typecheck   typecheck every source file"
	@echo "  make run         run the CLI (lib/interfaces/cli.js; needs npm run build first)"
	@echo "  make install     npm install"
	@echo "  make audit       typecheck + test"
	@echo "  make clean       remove node_modules / build output"

install: ## Install/link dependencies
	npm install

typecheck: ## Typecheck every source file
	npm run typecheck

test: ## Run the test suite
	npm test

run: ## Run the CLI (needs npm run build first)
	node lib/interfaces/cli.js

audit: typecheck test ## typecheck + test

clean: ## Remove node_modules / build output
	rm -rf node_modules dist lib *.tsbuildinfo
