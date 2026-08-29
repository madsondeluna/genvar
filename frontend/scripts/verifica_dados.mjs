#!/usr/bin/env node
// Recusa o build quando um arquivo de dados chegou como ponteiro de Git LFS.
//
// Os catálogos do ClinVar, dos painéis, do ClinGen, do CPIC e do burden são
// versionados com LFS. Um ambiente de build que clona SEM suporte a LFS recebe,
// no lugar de cada arquivo, um texto de 130 bytes:
//
//     version https://git-lfs.github.com/spec/v1
//     oid sha256:0b44c654...
//     size 234533
//
// O build compila limpo, o site sobe, e a aplicação fica quebrada em silêncio:
// a anotação não encontra nada, o filtro por painel não acha gene nenhum, e a
// tela mostra "0 de 30.009 encontradas" como se o arquivo do usuário não
// tivesse achado nenhum. É a pior classe de falha, a que parece resposta.
//
// Este verificador transforma isso num build que falha com a causa escrita.
// Rodar `git lfs install && git lfs pull` no ambiente de build é o conserto.

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// A raiz e a pasta do frontend, nao a do repositorio. O script morava em
// scripts/ na raiz e o build em Docker quebrava com "Cannot find module
// '/scripts/verifica_dados.mjs'": o Dockerfile copia so frontend/, e o prebuild
// apontava para fora do contexto de build. Trazer o script para dentro do
// contexto conserta o Docker sem tirar a verificacao de onde ela ja funcionava.
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..')

// Pastas cujo conteúdo é dado versionado com LFS, e a aplicação que morre sem
// cada uma. O texto vira a mensagem de erro, para o log dizer o que quebra.
const OBRIGATORIOS = [
  ['public/data/clinvar', 'anotação clínica do módulo de VCF', 'frontend'],
  ['public/data/paineis', 'filtro por painel e resolução de símbolo', 'frontend'],
  ['public/data/farmaco', 'validade gene-doença e farmacogenômica', 'frontend'],
  ['public/data/burden', 'coordenadas de gene e página de associação', 'frontend'],
  ['../backend/app/data', 'catálogos de doença, painel e escore servidos pela API',
   'repositório'],
]

const PONTEIRO = 'version https://git-lfs.github.com/spec/v1'

// O build do frontend em Docker copia SO a pasta frontend/, entao a arvore do
// backend nao existe naquele contexto. Ausencia de contexto nao e ausencia de
// dado: exigir os catalogos do backend ali reprovava um build que estava
// correto. A distincao e feita aqui e ANUNCIADA na saida, para "nao verificado"
// nunca passar por "verificado e aprovado".
const temBackend = existsSync(join(RAIZ, '..', 'backend'))

function arquivos(dir) {
  let fora = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('._') || e.name === '__pycache__') continue
    const p = join(dir, e.name)
    if (e.isDirectory()) fora = fora.concat(arquivos(p))
    else if (/\.(json|json\.gz)$/.test(e.name)) fora.push(p)
  }
  return fora
}

const problemas = []
const naoVerificados = []
let conferidos = 0

for (const [rel, paraQue, arvore] of OBRIGATORIOS) {
  if (arvore === 'repositório' && !temBackend) {
    naoVerificados.push([rel, paraQue])
    continue
  }
  const dir = join(RAIZ, rel)
  let lista
  try {
    lista = arquivos(dir)
  } catch {
    problemas.push(`${rel} não existe. Quebra: ${paraQue}.`)
    continue
  }
  if (!lista.length) {
    problemas.push(`${rel} está vazia. Quebra: ${paraQue}.`)
    continue
  }
  for (const f of lista) {
    conferidos += 1
    // Um ponteiro tem pouco mais de 100 bytes; ler o começo basta e não custa
    // memória num arquivo de megabytes.
    const inicio = readFileSync(f).subarray(0, 60).toString('utf8')
    if (inicio.startsWith(PONTEIRO)) {
      problemas.push(`${f.replace(`${RAIZ}/`, '')} é um ponteiro de LFS, não o arquivo. `
        + `Quebra: ${paraQue}.`)
    } else if (statSync(f).size < 200) {
      problemas.push(`${f.replace(`${RAIZ}/`, '')} tem menos de 200 bytes; parece truncado.`)
    }
  }
}

if (problemas.length) {
  console.error('\nBuild recusado: os dados não chegaram inteiros.\n')
  for (const p of problemas.slice(0, 12)) console.error(`  - ${p}`)
  if (problemas.length > 12) console.error(`  ... e mais ${problemas.length - 12}.`)
  console.error('\nNo ambiente de build, antes de instalar as dependências:\n')
  console.error('    git lfs install && git lfs pull\n')
  console.error('Sem isso a aplicação sobe e responde "nenhum achado" para todo arquivo,')
  console.error('que é indistinguível de um resultado de verdade.\n')
  process.exit(1)
}

console.log(`Dados conferidos: ${conferidos} arquivos, nenhum ponteiro de LFS.`)
for (const [rel, paraQue] of naoVerificados) {
  console.log(`Não verificado neste contexto: ${rel} (${paraQue}).`)
  console.log('  A árvore do backend não faz parte do contexto de build do frontend.')
}
