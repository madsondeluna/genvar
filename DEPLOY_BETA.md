# Deploy da beta em genvar.delunalab.dev/beta

Objetivo: publicar a versao beta sob `genvar.delunalab.dev/beta`, totalmente
isolada do TCC. O root `genvar.delunalab.dev` e os servicos de producao
(`genvar`, `genvar-backend`) nao sao tocados.

Arquitetura: um backend beta e um frontend beta novos no Render (nomes proprios),
mais uma regra no Cloudflare que roteia `/beta/*` para o frontend beta.

## O que ja esta pronto no repositorio

- Frontend base-path aware: `vite.config.js` le `base` de `VITE_BASE_PATH`
  (default `/`, sem efeito no build raiz); `App.jsx` usa
  `basename={import.meta.env.BASE_URL}`; as refs de assets em `PageNav.jsx` e
  `BrandMorphNav.jsx` usam `import.meta.env.BASE_URL`.
- `deploy/render-beta.yaml`: blueprint dos servicos beta (redis, backend, static).
- `deploy/cloudflare-beta-worker.js`: worker que expoe `/beta` no dominio.

## Passos (painel, feitos por voce)

1. A branch `beta` ja carrega toda a Fase 4 (merge feito). Nada a fazer aqui.

2. No Render, criar os servicos beta a partir de `deploy/render-beta.yaml`
   (branch `beta`). Sao 3: `genvar-cache-beta`, `genvar-backend-beta`,
   `genvar-beta`. Nao altere os servicos `genvar` e `genvar-backend`.
   - Confirme que o backend beta sobe: `https://genvar-backend-beta.onrender.com/health`.
   - Confirme o frontend beta: `https://genvar-beta.onrender.com/beta/`.

3. No Cloudflare (dominio delunalab.dev):
   - Crie um Worker com o conteudo de `deploy/cloudflare-beta-worker.js`.
   - Adicione a Route: `genvar.delunalab.dev/beta*` -> esse Worker.
   - So o caminho `/beta*` passa pelo worker; o resto do dominio (o TCC) segue
     intocado.

4. Validar:
   - Abra `https://genvar.delunalab.dev/beta/` (a beta).
   - Abra `https://genvar.delunalab.dev/beta/status` e veja as 7 fontes em tempo
     real (verde/vermelho, com latencia), servidas por
     `genvar-backend-beta/api/health/sources`.
   - Confirme que `https://genvar.delunalab.dev` (root/TCC) continua identico.

## Observacoes

- CORS: o backend beta ja aceita a origem `https://genvar.delunalab.dev`
  (mesmo host da pagina beta via Cloudflare).
- Isolamento: backend, redis e frontend beta sao servicos separados; nada
  compartilhado com o TCC. Reverter e so remover os 3 servicos e a route.
- Alternativa sem Worker: Cloudflare "Origin Rules" com override de host para o
  caminho `/beta*` apontando para `genvar-beta.onrender.com` cumpre o mesmo papel.
