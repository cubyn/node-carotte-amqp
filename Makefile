deps:
	yarn

lint:
	node_modules/.bin/eslint src tests

rabbitmq-start:
	@docker stop rabbitmq && docker rm rabbitmq >> /dev/null || true
	@docker run --name rabbitmq -d -p 15672:15672 -p 5672:5672 rabbitmq:3.6-management-alpine >> /dev/null

rabbitmq-stop:
	@docker stop rabbitmq >> /dev/null
	@docker rm rabbitmq >> /dev/null

test:
	node_modules/.bin/mocha tests/* src/**/*.spec.js

test-watch:
	node_modules/.bin/mocha -w tests/* src/**/*.spec.js

test-cover:
	node_modules/.bin/istanbul cover -x "src/**.spec.js" node_modules/.bin/_mocha -- tests/* src/**/*.spec.js
