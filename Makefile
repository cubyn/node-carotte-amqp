SHELL := $(shell which bash)
.SHELLFLAGS = -c

.SILENT: ;               # no need for @
.ONESHELL: ;             # recipes execute in same shell
.NOTPARALLEL: ;          # wait for this target to finish
.EXPORT_ALL_VARIABLES: ; # send all vars to shell

default: help

help: ## display help for make commands
	grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | sort | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-30s\033[0m %s\n", $$1, $$2}'
.PHONY: help

all: ## run all developer tasks
	$(MAKE) deps
	$(MAKE) lint
	$(MAKE) test-cover
.PHONY: all

githooks: uninstall_githooks ## install local git hooks (for developers)
	# git config core.hooksPath .githooks
	find .githooks -maxdepth 1 -type f -exec ln -v -sf ../../{} .git/hooks/ \;
	chmod a+x .git/hooks/*
.PHONY: githooks

uninstall_githooks: ## uninstall local git hooks
		find .git/hooks -type l -exec rm -v {} \;
.PHONY: uninstall_githooks

### application commands

deps: ## install dependencies
	yarn install
.PHONY: deps

test: ## run unit tests
	node_modules/.bin/mocha tests/* src/**/*.spec.js
.PHONY: test

test-watch: ## run unit tests and watch modified files
	node_modules/.bin/mocha -w tests/* src/**/*.spec.js
.PHONY: test-watch

test-cover: ## run unit tests with code coverage
	node_modules/.bin/istanbul cover -x "src/**.spec.js" node_modules/.bin/_mocha -- tests/* src/**/*.spec.js
.PHONY: test-cover

lint: ## check syntax
	node_modules/.bin/eslint src tests
.PHONY: lint

lint-watch: ## check syntax and watch modified files
	nodemon --exec './node_modules/.bin/eslint src'
.PHONY: lint-watch

rabbitmq-start: ## start the rabbitmq container
	docker stop rabbitmq && docker rm rabbitmq >> /dev/null || true
	docker run --name rabbitmq -d -p 15672:15672 -p 5672:5672 rabbitmq:3.6-management-alpine >> /dev/null
.PHONY: rabbitmq-start

rabbitmq-stop: ## stop the rabbitmq container
	docker stop rabbitmq >> /dev/null
	docker rm rabbitmq >> /dev/null
.PHONY: rabbitmq-stop
