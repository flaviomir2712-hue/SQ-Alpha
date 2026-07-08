# ── Etapa frontend ───────────────────────────────────────────────
FROM node:20-slim AS build-frontend
WORKDIR /app

# Tanda 8 — VITE_BACKEND_URL se "hornea" en el bundle durante el build
# (ver v27). Se mantiene igual.
ARG VITE_BACKEND_URL=https://sidequest-beta.fly.dev
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# ── Etapa backend ────────────────────────────────────────────────
FROM python:3.13-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/

# Tanda 10 — Fix 500 en login/register. Las migraciones de Alembic
# NUNCA se copiaban a la imagen (solo src/ y dist/), así que `flask db
# upgrade` no podía correr dentro del contenedor y las tablas nunca se
# crearon en la base de datos de Fly → cualquier query (User.query en
# login/register) revienta con 500.
#
# Copiamos la carpeta migrations/ para que el release_command de
# fly.toml (flask db upgrade) tenga los scripts disponibles.
COPY migrations/ ./migrations/

COPY --from=build-frontend /app/dist ./dist
EXPOSE 8080
CMD ["gunicorn", "-k", "gthread", "--threads", "100", "-w", "1", \
     "--bind", "0.0.0.0:8080", "wsgi", "--chdir", "./src/"]
