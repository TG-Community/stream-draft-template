DRAFT_FILE ?= $(firstword $(wildcard draft-*.md))

build:
	npm run build

release:
	npm run release

archive:
	npm run archive
