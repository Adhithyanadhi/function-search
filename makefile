IMAGE_NAME = function-search-benchmark
CONTAINER_NAME_DEV = function-name-search

build:
	docker compose build

dev: build
	docker compose up function-name-search

clean:
	docker compose down -v
