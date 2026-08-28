FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Recusa a imagem quando os catalogos chegaram como ponteiro de Git LFS. Sem
# isto o backend sobe, responde 200 e devolve catalogo VAZIO: a busca por doenca
# nao acha nada e a leitura disso e "nao existe", nao "o dado nao veio".
RUN python -c "import sys, pathlib; d = pathlib.Path('app/data'); p = [f for f in d.glob('*.json') if f.read_bytes()[:45].startswith(b'version https://git-lfs')]; sys.exit(0) if not p else (print('Imagem recusada: ponteiros de LFS em app/data:', [f.name for f in p]), print('No ambiente de build: git lfs install && git lfs pull'), sys.exit(1))"

EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
