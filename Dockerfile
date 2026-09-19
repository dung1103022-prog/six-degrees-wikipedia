# Six Degrees of Wikipedia (Python): one container, FastAPI serves the API, /share and the SPA
# (SPEC ADR-012, section 6.6).
#
#   docker build -t sixth-degree .
#   docker run --rm -p 8000:8000 sixth-degree            # honours $PORT when the platform sets one
#
# The official dataset (data/graph.json, people.json, aliases.json) is copied in at BUILD time and read
# from /app/data (DATA_DIR). Changing the dataset means building the image again. The image does not
# contain the fetcher and does not install httpx (the `fetcher` extra): at run time nothing calls the
# network, MediaWiki included (ADR-009). The only outside request is the visitor's browser loading
# thumbnails from the URLs in the data.

# ------------------------------------------------------------------ stage 1: build the frontend
FROM node:24-slim AS frontend
WORKDIR /build

# Dependencies first, so that this layer is cached until package-lock.json changes.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-fund --no-audit

COPY frontend/ ./
# `npm run build` = type-check of src/ + `vite build`; the result is /build/dist (SPEC 5.5: one <!--OG--> in <head>).
RUN npm run build

# ------------------------------------------------------------------ stage 2: runtime
FROM python:3.12-slim AS runtime

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Runtime dependencies come from backend/pyproject.toml, the single place where they are pinned. The
# optional `fetcher` and `test` extras are NOT installed.
COPY backend/pyproject.toml /tmp/pyproject.toml
RUN python -c "import tomllib; print('\n'.join(tomllib.load(open('/tmp/pyproject.toml', 'rb'))['project']['dependencies']))" > /tmp/requirements.txt \
    && pip install -r /tmp/requirements.txt \
    && rm /tmp/pyproject.toml /tmp/requirements.txt

# Application code (no fetcher.py, no tests), the built frontend, and the official dataset.
COPY backend/app ./app
COPY --from=frontend /build/dist ./dist
COPY data/graph.json data/people.json data/aliases.json ./data/

# SPEC 6.6 (DATA_DIR) and 5.5 / Q-10 (DIST_DIR, read because /share is on by default).
ENV DATA_DIR=/app/data \
    DIST_DIR=/app/dist \
    PORT=8000

RUN useradd --system --no-create-home --uid 10001 app
USER app

EXPOSE 8000

# The data and dist/ are validated at start-up (SPEC 6.5, 5.5): if either is missing or invalid the app
# does not start and the container exits at once (fail fast).
# `exec` so that uvicorn is PID 1 and gets SIGTERM.
CMD ["sh", "-c", "exec uvicorn app.main:create_app --factory --host 0.0.0.0 --port ${PORT}"]
