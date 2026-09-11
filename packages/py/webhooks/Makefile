##
## figma-webhooks — self-contained Makefile
##
## A comprehensive Python library for managing Figma webhooks
##

PYTHON ?= python3

.DEFAULT_GOAL := help

.PHONY: help install typecheck test audit clean

help: ## Show this help
	@echo "figma-webhooks targets:"
	@echo "  make test        run the test suite (pytest)"
	@echo "  make typecheck   mypy over src/"
	@echo "  make install     install dependencies (pip, requirements.txt)"
	@echo "  make audit       typecheck + test"
	@echo "  make clean       remove caches / build output"

install: ## Install dependencies (pip, requirements.txt)
	$(PYTHON) -m pip install -r requirements.txt

typecheck: ## Typecheck every source file (mypy)
	$(PYTHON) -m mypy src

test: ## Run the test suite (pytest)
	$(PYTHON) -m pytest

audit: typecheck test ## typecheck + test

clean: ## Remove caches / build output
	rm -rf out **/__pycache__ .pytest_cache
