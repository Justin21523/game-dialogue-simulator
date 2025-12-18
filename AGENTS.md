# Repository Guidelines

## Project Structure & Module Organization
- Frontend: `index.html` loads ES modules from `js/` (`core/` state, `ui/screens/` views, `systems/` logic); styles live in `css/`; art in `assets/`; game data in `data/*.json`.
- Backend: FastAPI package in `backend/` with routers under `backend/api/routers/`, agents/RAG in `backend/core/`, settings in `backend/config.py`, and knowledge JSON in `backend/data/knowledge/`.
- Docs in `docs/`, prompt templates in `prompts/`, helper scripts in `scripts/` (e.g., `generate_assets.py`).

## Build, Test, and Development Commands
- Frontend preview: `python3 -m http.server 8000` and open `http://localhost:8000/index.html`.
- Backend setup: `python3 -m venv .venv && source .venv/bin/activate && pip install -r backend/requirements.txt` (torch/LLM deps are heavy; use a CPU wheel if needed).
- Backend run: `uvicorn backend.main:app --reload --app-dir .`; configurable via env vars defined in `backend/config.py`.
- Asset tools: `python scripts/generate_assets.py --help` writes to `assets/`.
- Tests: `pytest backend` when cases exist; fixtures should stay small and deterministic.

## Coding Style & Naming Conventions
- JavaScript: 4-space indent, semicolons, `PascalCase` classes (`HangarScreen`), `camelCase` functions/state, `SCREAMING_SNAKE_CASE` configs, kebab-cased files.
- CSS: reuse `:root` variables in `css/main.css`, place shared pieces in `components.css`/`animations.css`, limit inline styles.
- Python: type-hinted functions with docstrings, module-level loggers, Pydantic models for payloads, and FastAPI routers for IO boundaries.
- Data: JSON keys stay lowercase with underscores; preserve locale fields (`name_zh`, etc.) when updating.

## Testing Guidelines
- Prefer `pytest` under `backend/tests/test_*.py`; use FastAPI’s `TestClient`/`AsyncClient` and patch LLM/Comfy/Chroma calls.
- For agents, seed random/torch modules and snapshot only structured fields (not embeddings or binaries).
- For frontend, add light DOM/component coverage or document manual steps in the PR when automation is hard.

## Commit & Pull Request Guidelines
- Use concise, imperative Conventional Commit headers (`feat:`, `fix:`, `docs:`) with one logical change per commit.
- PRs should note user impact, test commands (or “not run”), linked issues, and screenshots for UI tweaks; call out data/schema updates that require re-indexing or asset regen.

## Security & Configuration Tips
- Keep API keys and model artifacts out of the repo; supply via env vars (`LLM_*`, `RAG_*`, `COMFYUI_*`, `API_*`) or an ignored `.env`.
- Leave generated outputs (`assets/generated`, large models) untracked and document any new required paths in PR notes.
