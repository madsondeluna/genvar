# Resultados e discussão

Este capítulo mede a versão 3.0 do GenVar em duas frentes que a aplicação mantém separadas por desenho: a API, que agrega fontes públicas no servidor, e o módulo de análise de VCF, que roda inteiramente no navegador do usuário e não faz nenhuma requisição ao servidor. As duas frentes têm gargalos diferentes, e por isso são medidas com protocolos diferentes.

Todas as medições saíram da mesma máquina, um — com — núcleos e — GB de memória, em —, com Python — e Node v25.8.2. O código medido está no commit `—` da branch `—`.

## Como as medições foram feitas

Toda medição repetida é resumida por **mediana**, e não por média. Latência de rede tem cauda longa e assimétrica: a média é puxada por uma chamada lenta em vinte, e o desvio de uma distribuição assim não delimita nada. A mediana descreve o caso típico e o p95 descreve a cauda, que é a pergunta que interessa em serviço. O intervalo de confiança da mediana vem de bootstrap percentil com 2.000 reamostragens e semente fixa, para que o intervalo publicado seja conferível.

O número de repetições não é o mesmo em toda parte, e a assimetria é deliberada. Uma repetição com cache quente custa uma consulta ao Redis. Uma repetição com cache frio custa o que a rota gastar em chamadas a bases públicas. Com repetição alta em todas as rotas, uma única execução do benchmark passaria de três mil chamadas ao Ensembl, ao gnomAD e ao ClinVar, e o uso justo dessas bases é por IP: a varredura derruba o acesso do projeto inteiro e o benchmark deixa de ser reproduzível. Onde o N foi reduzido por esse motivo, o intervalo de confiança acompanha o valor para que a perda de precisão fique visível em vez de implícita.

## Latência da API e o efeito do cache

| Família | Rotas | Frio (ms) | Quente (ms) | p95 frio (ms) | Ganho |
|---|---|---|---|---|---|
| gene | 20 | 3.300,9 | 3,8 | 4.768,4 | 1.057× |
| variante | 5 | 2.737,1 | 4,3 | 3.681,6 | 636× |
| doença | 10 | 1.783,7 | 4,0 | 1.894,4 | 474× |
| painel | 5 | 448,6 | 4,1 | 540,6 | 109× |
| escore poligênico | 5 | 1.756,4 | 3,0 | 1.861,3 | 493× |
| listagem | 6 | 3,9 | 2,6 | 5,8 | 1× |
| meta | 13 | 4,1 | 3,3 | 6,0 | 1× |

![Figura 1](figuras/fig01_latencia_familia.png)

**Fig. 1.** Latência mediana por família de rota, com cache frio e com cache quente, em escala logarítmica. A escala é logarítmica porque a razão entre as duas condições passa de três ordens de grandeza; em escala linear a barra do cache quente seria invisível.

A Fig. 1 separa as rotas em dois regimes que a média esconderia. As rotas que consultam bases externas quando o cache erra respondem em 2.737,1 ms de mediana no estado frio, e as que respondem de catálogo em memória, em 4,1 ms. Com cache quente as duas convergem: 3,8 ms contra 3,3 ms. O cache não acelera a aplicação de forma uniforme; ele apaga a diferença entre consultar a rede e não consultar.

![Figura 2](figuras/fig02_ganho_cache.png)

**Fig. 2.** Ganho do cache por rota, em escala logarítmica, ordenado. A linha tracejada marca o ganho unitário, isto é, nenhuma diferença. Verde para ganho acima de cem vezes, azul entre dez e cem, cinza abaixo de dez.

A Fig. 2 mostra que o ganho não é uma propriedade da aplicação, e sim de cada rota. O extremo superior é `doenca variantes`, com 2.938 vezes, e o inferior é `sugestao`, com 0,7 vezes. As rotas de baixo ganho são exatamente as que já respondiam de memória: guardá-las no Redis troca uma leitura local por uma ida ao Redis, e o ganho fica próximo de um. Isso não é desperdício desprezível: são chaves ocupando memória para economizar microssegundos, e a seção sobre custo do cache retoma esse ponto.

![Figura 3](figuras/fig03_dispersao_latencia.png)

**Fig. 3.** Mediana com intervalo de confiança de 95% e p95 da latência fria, por rota que consulta a rede. A distância entre a mediana e o p95 mede a dependência de fontes de terceiros: ela não é ruído da aplicação, é a variabilidade das bases públicas.

A Fig. 3 traz a informação que a mediana sozinha esconde. A rota `gene fenotipos` tem mediana de 1.724,3 ms e p95 de 90.932,6 ms, uma razão de 52,7. Uma consulta em vinte custa esse valor, e é ele que define a experiência de quem espera pela tela. A causa está fora da aplicação: o servidor não controla o tempo de resposta do Ensembl nem do gnomAD, e a única defesa disponível é não perguntar de novo, que é o que o cache faz.

## Pressão sobre as bases públicas

As duas seções anteriores mediram tempo. Esta mede um custo que o tempo esconde: quantas requisições cada consulta dispara contra bases mantidas por terceiros. Uma rota que responde em novecentos milissegundos fazendo nove chamadas ao Ensembl não é a mesma coisa que uma que responde no mesmo tempo fazendo uma, ainda que o gráfico de latência as pinte iguais. A contagem foi feita substituindo o ponto de envio do cliente HTTP por um contador, e inclui retentativas: o que se conta é o que foi pedido à fonte, não o que a função pretendia pedir.

A [figura ausente] mostra a distribuição desse custo. O topo é `painel`, com 11 requisições por consulta fria, e a mediana entre as famílias que usam rede é de 4,7. Com o cache quente, todas caem a zero, sem exceção: a economia não é parcial. É esse zero que torna a aplicação utilizável em sala de aula, onde trinta pessoas consultam o mesmo gene em poucos minutos e apenas a primeira consulta chega às fontes.

## Tratamento de entrada inválida

A [figura ausente] resume 26 casos de borda: símbolo inexistente, caracteres especiais, comprimento absurdo, injeção de caminho, identificador fora do padrão e consulta vazia, em todas as famílias de rota. 24 de 26 foram tratados dentro do esperado e 0 devolveram 500. Um 500 seria falha mesmo com mensagem boa: significa que a exceção chegou ao topo sem tratamento, e num serviço público isso vaza rastro de pilha.

| Família | Caso | Esperado | Obtido |
|---|---|---|---|
| gene | fenotipos de gene inexistente | 404 | 200 |
| variante | rsid inexistente | 404 | 200 |

Os casos acima são divergências reais entre o que o protocolo previa e o que a API devolve. Estão listados em vez de omitidos porque um capítulo de resultados que só mostra o que passou não é um resultado.

## O pipeline de VCF no navegador

A partir daqui a medição muda de objeto. O módulo de VCF não passa pelo servidor: ele lê o arquivo no navegador, cruza contra catálogos servidos como assets estáticos e escreve as saídas ali mesmo. Nenhuma etapa faz requisição à API, e por isso nada nesta seção depende de rede, de cache ou de limitador de taxa. O que limita aqui é memória e tempo de processador.

![Figura 4](figuras/fig14_custo_por_escala.png)

**Fig. 4.** Custo de cada etapa do pipeline em função do número de variantes do arquivo, nos dois eixos em escala logarítmica. Em escala log-log, uma reta indica crescimento proporcional a uma potência do tamanho, e a inclinação é o expoente.

A Fig. 4 percorre o corpus de 16 arquivos, de 323 a 600.000 variantes. As etapas crescem em ritmos diferentes, e é isso que decide onde otimizar: a etapa que domina em arquivo pequeno não é a que domina em exoma.

![Figura 5](figuras/fig16_funcoes_piso.png)

**Fig. 5.** Piso de tempo de cada função sobre o menor arquivo do corpus, em escala logarítmica. É o custo que a função tem por existir, antes de qualquer efeito de escala.

A Fig. 5 isola o custo fixo. Sobre o menor arquivo do corpus, a função mais cara é `ClinVar`, com 1.343,2 ms, e ela é cara independentemente do tamanho do arquivo: é montagem de índice e leitura de catálogo, trabalho que acontece uma vez por sessão. Numa sessão que analisa um arquivo só, esse piso é a maior parte do tempo total; numa que analisa uma coorte, ele se dilui, e é esse o argumento quantitativo a favor do modo em lote.

## As seis saídas e o custo de cada uma

![Figura 6](figuras/fig15_saidas.png)

**Fig. 6.** À esquerda, tempo de geração de cada formato, mediana do corpus, em escala logarítmica; a linha tracejada marca um segundo, limite prático entre uma interface que responde e uma que trava, já que a geração roda na thread principal. À direita, tamanho do arquivo produzido, também em escala logarítmica.

A Fig. 6 mede as seis saídas que a página oferece. A mais cara é o PDF, com 2.232,5 ms de mediana, e a mais barata é o VCF anotado, com 61,8 ms: uma razão de 36 vezes entre os extremos.

O resultado que corrige a versão anterior deste benchmark está aqui. Na medição anterior o PDF não era gerado, e o XLSX era montado com uma aba só e medido antes de o compactador do formato passar a comprimir de fato: aquele número descrevia um arquivo que a aplicação não produz. Com as seis saídas medidas pelas mesmas funções que os botões chamam, o PDF é 2,5 vezes mais caro que o XLSX, e não o contrário.

O painel da direita mostra a relação inversa entre custo e tamanho. O JSON produz o maior arquivo, 17,8 MB, e o PDF o menor, 119,9 KB. Custo e tamanho medem coisas diferentes: o formato tabular serializa tudo o que foi lido, e o laudo resume, o que custa decisão de layout e paginação e produz menos bytes.

## Limitações desta medição

- **Uma máquina só.** Todas as medições saíram do mesmo equipamento, um None com — GB de memória. Os valores absolutos não se transferem para outro hardware; as razões entre condições, que é o que as figuras comparam, se transferem melhor.
- **As fontes públicas variam com o dia.** A latência fria mede o Ensembl, o gnomAD e o ClinVar tanto quanto mede o GenVar. Duas execuções em dias diferentes não devolvem os mesmos milissegundos, e por isso as conclusões estão sempre em razões entre condições medidas na mesma sessão.
- **O N das suítes que tocam a rede é menor.** Repetir com N alto derrubaria o acesso do projeto às bases, que aplicam uso justo por IP. O intervalo de confiança acompanha esses valores para que a imprecisão fique visível.
- **A expiração por TTL não foi medida.** O TTL de produção é de uma hora, e esperar por ele multiplicaria a duração da execução sem acrescentar informação: uma chave expirada é indistinguível de uma chave ausente, que é o que a medição fria já exercita. Medir com um TTL de brinquedo descreveria outra configuração.
- **O tempo humano do fluxo manual é estimativa de literatura.** Ele aparece em coluna separada e nunca somado ao tempo medido sem aviso.
- **A versão 2.0 não pode ser remedida.** O código está congelado num commit anterior e as fontes externas mudaram desde então. A comparação entre versões se restringe às métricas cujo protocolo é idêntico e cujo alvo ainda existe, com a data de cada medição declarada na legenda.

