FROM python:3.11-slim

WORKDIR /app

COPY apps/matching-service/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/matching-service/app ./app

CMD ["sh", "-c", "python -m app.migrate && uvicorn app.main:app --host 0.0.0.0 --port ${MATCHING_SERVICE_PORT:-3007}"]
