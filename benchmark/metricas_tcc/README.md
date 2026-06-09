# metricas_tcc

Material de apoio para a seção Resultados Preliminares do TCC do GenVar Dashboard. Gerado em 8 de junho de 2026 a partir da bateria de benchmarks do projeto.

## Conteúdo

- `RESULTADOS_PRELIMINARES.md`: rascunho da seção, com os números reais e referências às figuras. Pontos `[INSERIR FIGURA: ...]` aguardam as imagens. Este é o texto principal.
- `PLANO_RESULTADOS.md`: documento de planejamento (mapa métrica para objetivo, metodologia). Mantido como histórico.
- `dados/`: arquivos CSV brutos das seis suites de benchmark.
- `figuras/`: 12 figuras PNG geradas a partir dos CSVs. As capturas de tela da interface ainda precisam ser adicionadas aqui.

## Como os números foram obtidos

Backend e Redis rodando localmente; bateria executada com `python run_benchmarks.py` (pasta `benchmark/` do projeto) e figuras com `python plot_results.py`. Ambiente: Apple M2, 8 núcleos, 8 GB, macOS 26.5, Python 3.12.11.

A figura `fig_cache_speedup.png` foi regerada usando a chamada sem cache (a mais lenta da fase fria) como linha de base, em vez da média da fase fria, que mistura uma chamada fria com onze em cache e subestima o ganho.

## Ressalvas para a banca (já refletidas no texto)

- A latência ponta a ponta é dominada pelas APIs de terceiros; o ganho atribuível à plataforma está no cache (229x a 842x) e na consulta única.
- O tempo frio elevado dos genes vem da agregação do conjunto completo de variantes; o cache amortiza as consultas seguintes.
- A contagem bruta de campos não é medida de valor: o MyVariant.info devolve centenas de campos brutos aninhados e foi excluído da comparação de variantes; o valor da plataforma é a normalização cruzada e a consolidação em uma vista, não a contagem.
- A aceleração de máquina por paralelismo é de 1,18x a 1,74x para variantes e fica próxima de 1 para genes (a agregação das variantes ocorre no servidor); o ganho do lado gene está no cache, na integração e na distribuição posicional.
- O speedup de 242x a 370x (variantes) e 65x a 254x (genes) sobre o fluxo manual completo inclui uma estimativa de 15 minutos de processamento humano por consulta, documentada na suite.

## Pendências

- Inserir as capturas de tela (home, página de gene, página de variante) em `figuras/` e nos pontos marcados no texto.
- Decidir se o texto vai direto para o arquivo do TCC (não alterado até aqui) ou se vira um `.docx` à parte.
