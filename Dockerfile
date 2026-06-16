FROM node:20-slim AS build-frontend
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

FROM python:3.13-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev curl && \
    rm -rf /var/lib/apt/lists/*
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY src/ ./src/
COPY --from=build-frontend /app/dist ./dist
EXPOSE 8080
CMD ["gunicorn", "-k", "gthread", "--threads", "100", "-w", "1", \
     "--bind", "0.0.0.0:8080", "wsgi", "--chdir", "./src/"]
