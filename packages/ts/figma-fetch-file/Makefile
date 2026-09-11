##
## @internal/figma-api-fetch-file — self-contained Makefile
##
## Figma file-download domain: skeleton/nodes/whole-file endpoints plus the chunked large-file download engine, composed over @internal/figma-api-fetch
##

.DEFAULT_GOAL := help

.PHONY: help install sdk typecheck test audit clean

help: ## Show this help
	@echo "@internal/figma-api-fetch-file targets:"
	@echo "  make sdk         build the workspace SDK package this package depends on"
	@echo "  make test        build the SDK dep, then run the test suite"
	@echo "  make typecheck   TODO: no typecheck script defined"
	@echo "  make install     npm install"
	@echo "  make audit       typecheck + test"
	@echo "  make clean       remove node_modules / build output"

install: ## Install/link dependencies
	npm install

sdk: ## Build the workspace SDK package this package consumes
	npm --prefix ../figma-fetch run build

typecheck: ## TODO: no typecheck script in package.json
	@echo "TODO: typecheck"

test: sdk ## Build the SDK dep, then run the test suite
	npm test

audit: typecheck test ## typecheck + test

clean: ## Remove node_modules / build output
	rm -rf node_modules dist lib *.tsbuildinfo
