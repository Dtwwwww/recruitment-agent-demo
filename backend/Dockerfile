FROM python:3.12-slim

WORKDIR /app

# 安装系统依赖 + Playwright 浏览器
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && pip install playwright \
    && playwright install chromium \
    && playwright install-deps chromium \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
