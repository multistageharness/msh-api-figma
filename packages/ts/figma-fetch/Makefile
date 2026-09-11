##
## @internal/figma-api-fetch — self-contained Makefile
##
## Abstract fetch client for Figma API with composable utilities
##

.DEFAULT_GOAL := help

.PHONY: help install typecheck test audit clean

help: ## Show this help
	@echo "@internal/figma-api-fetch targets:"
	@echo "  make test        run the test suite"
	@echo "  make typecheck   TODO: no typecheck script defined"
	@echo "  make install     npm install"
	@echo "  make audit       typecheck + test"
	@echo "  make clean       remove node_modules / build output"

install: ## Install/link dependencies
	npm install

typecheck: ## TODO: no typecheck script in package.json
	@echo "TODO: typecheck"

test: ## Run the test suite
	npm test

audit: typecheck test ## typecheck + test

clean: ## Remove node_modules / build output
	rm -rf node_modules dist lib *.tsbuildinfo
