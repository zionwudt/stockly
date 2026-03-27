FROM python:3.11-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

COPY pyproject.toml README.md ./
COPY src ./src
COPY data ./data

RUN pip install --no-cache-dir .

EXPOSE 8000

CMD ["python", "src/backend/app.py", "--host", "0.0.0.0", "--port", "8000", "--db", "/app/data/jiancang.db"]
