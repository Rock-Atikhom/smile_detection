.PHONY: python-sync python-test python-format-check python-lint python-mypy python-run

DESKTOP_REFERENCE := apps/desktop-reference

python-sync:
	cd $(DESKTOP_REFERENCE) && uv sync --frozen --all-groups

python-test:
	cd $(DESKTOP_REFERENCE) && uv run pytest -q

python-format-check:
	cd $(DESKTOP_REFERENCE) && uv run ruff format --check src tests

python-lint:
	cd $(DESKTOP_REFERENCE) && uv run ruff check src tests

python-mypy:
	cd $(DESKTOP_REFERENCE) && uv run mypy src tests

python-run:
	cd $(DESKTOP_REFERENCE) && uv run smart-smile
