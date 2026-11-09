# Orbital — Product Engineering Take-Home

Welcome! This is a take-home assessment for a Product Engineering role at Orbital.

You've been given a working baseline application: a document Q&A tool for commercial real estate lawyers. Users upload legal documents (leases, title reports, environmental assessments) and ask questions about them. The AI assistant answers questions grounded in the document content.

The app works, but it has limitations. Your job is to extend it.

---

## Setup

### Prerequisites
- Docker and Docker Compose
- just (command runner) — install via `brew install just` or `cargo install just`

That's it. Everything else runs inside containers.

### Getting Started

1. Clone this repository

2. Run the setup command:
```
just setup
```
   This copies `.env.example` to `.env` and builds the Docker images.

3. Choose an LLM provider in `.env` and fill in its API key. For Anthropic:
```
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=your_key_here
```
   Or use OpenAI:
```
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key_here
```
   Orbital uses the selected provider for document answers and conversation titles.
   Existing configurations without `LLM_PROVIDER` default to Anthropic.
   After switching providers while the app is running, run `docker compose up -d backend`
   to recreate the backend container with the updated environment.

4. Start everything:
```
just dev
```
   This starts PostgreSQL, the FastAPI backend (port 8000), and the React frontend (port 5173).
   Database migrations run automatically when the backend starts — no separate step needed.

5. Open http://localhost:5173 in your browser.

Your local `backend/src/` and `frontend/src/` directories are mounted into the containers —
edit files normally on your machine and changes hot-reload automatically.

### Sample Documents

We've included sample legal documents in `sample-docs/` for testing.

### Project Structure

- `frontend/` — React frontend (Vite + Tailwind + shadcn/Radix UI)
- `backend/` — FastAPI backend (Python 3.12 + SQLAlchemy + PydanticAI)
- `alembic/` — Database migrations
- `sample-docs/` — Sample PDF documents for testing

### Useful Commands

- `just dev` — Start full stack (Postgres + backend + frontend)
- `just stop` — Stop all services
- `just reset` — Stop everything and clear database
- `just check` — Run all linters and type checks
- `just fmt` — Format all code
- `just db-init` — Run database migrations
- `just db-shell` — Open a psql shell
- `just shell-backend` — Shell into backend container
- `just logs-backend` — Tail backend logs
