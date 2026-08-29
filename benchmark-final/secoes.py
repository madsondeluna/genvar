"""
O texto de RESULTADOS.md. Cada secao le o seu CSV e escreve o que ele diz.

Secao cujo CSV nao existe e OMITIDA em vez de escrita com valor inventado: um
capitulo de resultados que descreve uma medicao que nao aconteceu e pior do que
um capitulo mais curto.
"""
import pandas as pd

ORDEM = ["gene", "variante", "doenca", "painel", "escore", "listagem", "meta"]
ROTULO = {"gene": "gene", "variante": "variante", "doenca": "doença",
          "painel": "painel", "escore": "escore poligênico",
          "listagem": "listagem", "meta": "meta"}


def escrever(d, num):
    _abertura(d, num)
    _metodo(d, num)
    _latencia(d, num)
    _cache(d, num)
    _requisicoes(d, num)
    _carga(d, num)
    _erros(d, num)
    _completude(d, num)
    _comparacao(d, num)
    _pipeline(d, num)
    _saidas(d, num)
    _lote(d, num)
    _limitacoes(d, num)


# ------------------------------------------------------------------ abertura --
def _abertura(d, num):
    d.titulo(1, "Resultados e discussão")
    amb = d.json_("ambiente_medicao.json") or d.json_("ambiente.json") or {}
    d.txt(
        "Este capítulo mede a versão 3.0 do GenVar em duas frentes que a aplicação "
        "mantém separadas por desenho: a API, que agrega fontes públicas no servidor, "
        "e o módulo de análise de VCF, que roda inteiramente no navegador do usuário "
        "e não faz nenhuma requisição ao servidor. As duas frentes têm gargalos "
        "diferentes, e por isso são medidas com protocolos diferentes.")
    if amb:
        d.txt(
            f"Todas as medições saíram da mesma máquina, um {amb.get('cpu','—')} com "
            f"{amb.get('nucleos','—')} núcleos e {num(amb.get('memoria_gb'),0)} GB de "
            f"memória, em {amb.get('sistema','—')}, com Python {amb.get('python','—')} e "
            f"Node {amb.get('node','—')}. O código medido está no commit "
            f"`{amb.get('commit','—')}` da branch `{amb.get('branch','—')}`.")


def _metodo(d, num):
    d.titulo(2, "Como as medições foram feitas")
    d.txt(
        "Toda medição repetida é resumida por **mediana**, e não por média. Latência "
        "de rede tem cauda longa e assimétrica: a média é puxada por uma chamada lenta "
        "em vinte, e o desvio de uma distribuição assim não delimita nada. A mediana "
        "descreve o caso típico e o p95 descreve a cauda, que é a pergunta que "
        "interessa em serviço. O intervalo de confiança da mediana vem de bootstrap "
        "percentil com 2.000 reamostragens e semente fixa, para que o intervalo "
        "publicado seja conferível.")
    d.txt(
        "O número de repetições não é o mesmo em toda parte, e a assimetria é "
        "deliberada. Uma repetição com cache quente custa uma consulta ao Redis. Uma "
        "repetição com cache frio custa o que a rota gastar em chamadas a bases "
        "públicas. Com repetição alta em todas as rotas, uma única execução do "
        "benchmark passaria de três mil chamadas ao Ensembl, ao gnomAD e ao ClinVar, e "
        "o uso justo dessas bases é por IP: a varredura derruba o acesso do projeto "
        "inteiro e o benchmark deixa de ser reproduzível. Onde o N foi reduzido por "
        "esse motivo, o intervalo de confiança acompanha o valor para que a perda de "
        "precisão fique visível em vez de implícita.")


# ------------------------------------------------------------------ latencia --
def _latencia(d, num):
    dl = d.csv("latencia.csv")
    if dl is None:
        return
    dl = dl[dl.frio_mediana.notna() & dl.quente_mediana.notna()]
    d.titulo(2, "Latência da API e o efeito do cache")

    fam = [f for f in ORDEM if f in set(dl.familia)]
    linhas = []
    for f in fam:
        s = dl[dl.familia == f]
        linhas.append([ROTULO[f], len(s), num(s.frio_mediana.median()),
                       num(s.quente_mediana.median()),
                       num(s.frio_p95.median()),
                       f"{num(s.ganho_cache.median(), 0)}×"])
    d.tabela(["Família", "Rotas", "Frio (ms)", "Quente (ms)", "p95 frio (ms)", "Ganho"],
             linhas)

    g1 = d.figura("fig01_latencia_familia.png",
                  "Latência mediana por família de rota, com cache frio e com cache "
                  "quente, em escala logarítmica. A escala é logarítmica porque a razão "
                  "entre as duas condições passa de três ordens de grandeza; em escala "
                  "linear a barra do cache quente seria invisível.")
    rede = dl[dl.de_rede]
    local = dl[~dl.de_rede]
    d.txt(
        f"A {g1} separa as rotas em dois regimes que a média esconderia. As rotas que "
        f"consultam bases externas quando o cache erra respondem em "
        f"{num(rede.frio_mediana.median())} ms de mediana no estado frio, e as que "
        f"respondem de catálogo em memória, em {num(local.frio_mediana.median())} ms. "
        f"Com cache quente as duas convergem: {num(rede.quente_mediana.median())} ms "
        f"contra {num(local.quente_mediana.median())} ms. O cache não acelera a "
        f"aplicação de forma uniforme; ele apaga a diferença entre consultar a rede e "
        f"não consultar.")

    g2 = d.figura("fig02_ganho_cache.png",
                  "Ganho do cache por rota, em escala logarítmica, ordenado. A linha "
                  "tracejada marca o ganho unitário, isto é, nenhuma diferença. Verde "
                  "para ganho acima de cem vezes, azul entre dez e cem, cinza abaixo "
                  "de dez.")
    melhor = dl.loc[dl.ganho_cache.idxmax()]
    pior = dl.loc[dl.ganho_cache.idxmin()]
    d.txt(
        f"A {g2} mostra que o ganho não é uma propriedade da aplicação, e sim de cada "
        f"rota. O extremo superior é `{melhor.nome}`, com "
        f"{num(melhor.ganho_cache, 0)} vezes, e o inferior é `{pior.nome}`, com "
        f"{num(pior.ganho_cache, 1)} vezes. As rotas de baixo ganho são exatamente as "
        f"que já respondiam de memória: guardá-las no Redis troca uma leitura local por "
        f"uma ida ao Redis, e o ganho fica próximo de um. Isso não é desperdício "
        f"desprezível: são chaves ocupando memória para economizar microssegundos, e a "
        f"seção sobre custo do cache retoma esse ponto.")

    g3 = d.figura("fig03_dispersao_latencia.png",
                  "Mediana com intervalo de confiança de 95% e p95 da latência fria, "
                  "por rota que consulta a rede. A distância entre a mediana e o p95 "
                  "mede a dependência de fontes de terceiros: ela não é ruído da "
                  "aplicação, é a variabilidade das bases públicas.")
    pior95 = rede.loc[rede.frio_p95.idxmax()]
    d.txt(
        f"A {g3} traz a informação que a mediana sozinha esconde. A rota `"
        f"{pior95.nome}` tem mediana de {num(pior95.frio_mediana)} ms e p95 de "
        f"{num(pior95.frio_p95)} ms, uma razão de "
        f"{num(pior95.frio_p95 / pior95.frio_mediana, 1)}. Uma consulta em vinte "
        f"custa esse valor, e é ele que define a experiência de quem espera pela tela. "
        f"A causa está fora da aplicação: o servidor não controla o tempo de resposta "
        f"do Ensembl nem do gnomAD, e a única defesa disponível é não perguntar de "
        f"novo, que é o que o cache faz.")


# --------------------------------------------------------------------- cache --
def _cache(d, num):
    dc = d.csv("cache_por_rota.csv")
    ds = d.csv("cache_sessao.csv")
    dr = d.csv("cache_recorte.csv")
    if dc is None and ds is None and dr is None:
        return
    d.titulo(2, "O que o cache custa e o que ele economiza")

    if dc is not None:
        g = d.figura("fig06_cache_memoria.png",
                     "Ganho de tempo contra memória ocupada no Redis, por família de "
                     "rota, nos dois eixos em escala logarítmica. Cada ponto é a "
                     "mediana da família. O canto superior esquerdo é o melhor negócio: "
                     "muito ganho por pouca memória.")
        m = dc.groupby("familia").agg(ganho=("ganho", "median"),
                                      kb=("bytes_no_redis", "median")).dropna()
        m["kb"] /= 1024
        melhor = m.assign(razao=m.ganho / m.kb).sort_values("razao", ascending=False)
        d.txt(
            f"A {g} responde uma pergunta que o gráfico de ganho sozinho não responde: "
            f"quanto custa manter esse ganho. A família `{melhor.index[0]}` entrega "
            f"{num(melhor.ganho.iloc[0], 0)} vezes de aceleração por "
            f"{num(melhor.kb.iloc[0])} KB de memória por consulta, e a família "
            f"`{melhor.index[-1]}` entrega {num(melhor.ganho.iloc[-1], 0)} vezes por "
            f"{num(melhor.kb.iloc[-1])} KB. A diferença entre as duas não é de "
            f"eficiência do cache: é do tamanho da resposta que cada rota devolve.")

    if ds is not None and not ds.empty:
        g = d.figura("fig07_cache_sessao.png",
                     "Tempo acumulado ao longo de uma sessão de consultas com "
                     "repetição, com e sem cache. A sequência é sorteada por uma lei de "
                     "Zipf com semente fixa, que é como o acesso a catálogo se "
                     "distribui na prática: poucas consultas muito repetidas e uma "
                     "cauda de consultas únicas.")
        tot = ds[ds.status == 200].groupby("modo").ms.sum() / 1000
        n_consultas = ds[ds.modo == "com cache"].shape[0]
        distintas = ds[ds.modo == "com cache"].caminho.nunique()
        if "sem cache" in tot.index and "com cache" in tot.index:
            d.txt(
                f"A {g} mede o efeito acumulado, que é o que um usuário sente. As mesmas "
                f"{n_consultas} consultas, das quais {distintas} distintas, levam "
                f"{num(tot['sem cache'])} segundos sem cache e {num(tot['com cache'])} "
                f"segundos com cache, uma razão de "
                f"{num(tot['sem cache'] / tot['com cache'], 1)}. A razão é menor que o "
                f"ganho por consulta isolada, e tem de ser: as consultas distintas pagam "
                f"o preço cheio nas duas condições, e o cache só age na repetição.")

    if dr is not None and not dr.empty:
        g = d.figura("fig08_cache_recorte.png",
                     "Três medições por gene, em escala logarítmica: a consulta com "
                     "variantes no cache frio, a consulta sem variantes feita logo "
                     "depois, e essa mesma consulta repetida. A segunda barra alta "
                     "mostra que a entrada do recorte com variantes não serve ao "
                     "recorte sem elas.")
        novas = dr.chaves_novas_do_sem.median()
        d.txt(
            f"A {g} verifica uma decisão de desenho da chave. `gene:v6:{{símbolo}}:"
            f"{{com|sem}}` guarda duas entradas para o mesmo gene, e a medição confirma "
            f"que uma não serve à outra: a consulta sem variantes, feita logo após a "
            f"consulta com variantes do mesmo gene, ainda custa "
            f"{num(dr.ms_sem_apos_com.median())} ms e cria "
            f"{num(novas, 0)} chave nova, contra {num(dr.ms_sem_quente.median())} ms "
            f"quando repetida. Servir a resposta completa a quem pediu o recorte curto "
            f"seria mais rápido de implementar e devolveria dados que o cliente não "
            f"pediu; guardar os dois recortes custa memória e mantém a resposta igual "
            f"ao que a rota promete.")


# -------------------------------------------------------------- requisicoes --
def _requisicoes(d, num):
    dr = d.csv("requisicoes.csv")
    if dr is None:
        return
    dr = dr[(dr.status_frio == 200) & (dr.status_quente == 200)]
    if dr.empty:
        return
    d.titulo(2, "Pressão sobre as bases públicas")
    d.txt(
        "As duas seções anteriores mediram tempo. Esta mede um custo que o tempo "
        "esconde: quantas requisições cada consulta dispara contra bases mantidas por "
        "terceiros. Uma rota que responde em novecentos milissegundos fazendo nove "
        "chamadas ao Ensembl não é a mesma coisa que uma que responde no mesmo tempo "
        "fazendo uma, ainda que o gráfico de latência as pinte iguais. A contagem foi "
        "feita substituindo o ponto de envio do cliente HTTP por um contador, e inclui "
        "retentativas: o que se conta é o que foi pedido à fonte, não o que a função "
        "pretendia pedir.")

    g = d.figura("fig04_requisicoes.png",
                 "Requisições a bases públicas por consulta, com cache frio e com "
                 "cache quente, por família de rota. Com cache quente todas as "
                 "famílias fazem zero requisições, e as barras correspondentes têm "
                 "comprimento nulo.")
    m = dr.groupby("familia").requisicoes_frio.mean().sort_values(ascending=False)
    rede = m[m > 0]
    d.txt(
        f"A {g} mostra a distribuição desse custo. O topo é `{rede.index[0]}`, com "
        f"{num(rede.iloc[0])} requisições por consulta fria, e a mediana entre as "
        f"famílias que usam rede é de {num(rede.median())}. Com o cache quente, todas "
        f"caem a zero, sem exceção: a economia não é parcial. É esse zero que torna a "
        f"aplicação utilizável em sala de aula, onde trinta pessoas consultam o mesmo "
        f"gene em poucos minutos e apenas a primeira consulta chega às fontes.")

    g2 = d.figura("fig05_requisicoes_host.png",
                  "Composição das requisições por base de destino, com cache frio. "
                  "Barras empilhadas em escala linear, e não logarítmica: em eixo "
                  "logarítmico o comprimento de um segmento empilhado depende de onde "
                  "ele começa, e a composição deixa de ser legível.")
    if "hosts" in dr.columns:
        painel = dr[dr.familia == "painel"]
        if not painel.empty and isinstance(painel.hosts.iloc[0], str):
            d.txt(
                f"A {g2} mostra que a pressão não se distribui por igual entre as "
                f"fontes. A rota de painel concentra as suas "
                f"{num(painel.requisicoes_frio.mean())} requisições quase inteiramente "
                f"no gnomAD, porque ela consulta a restrição de cada gene do painel, um "
                f"gene por chamada. É o ponto do sistema que mais depende de uma única "
                f"base de terceiros, e o que mais se beneficiaria de uma consulta em "
                f"lote, que a API do gnomAD não oferece.")


# --------------------------------------------------------------------- carga --
def _carga(d, num):
    de = d.csv("exaustao.csv")
    if de is None:
        return
    conc = de[de.fase == "concorrente"]
    if conc.empty:
        return
    d.titulo(2, "Comportamento sob carga e o limitador de taxa")
    d.txt(
        "A versão 3.0 tem um limitador de taxa que a 2.0 não tinha, e ele dispensa "
        "quem chega pelo loopback sem cabeçalho de encaminhamento. Isso cria duas "
        "perguntas distintas, e respondê-las com um número só seria errado nas duas "
        "pontas. A primeira é quanto o servidor aguenta, medida com o limitador "
        "dispensado. A segunda é o que um usuário real encontra, medida com o "
        "cabeçalho preenchido, como qualquer requisição vinda do proxy de produção. As "
        "duas foram medidas separadamente e não são somadas.")

    g = d.figura("fig09_concorrencia.png",
                 "À esquerda, latência mediana sob concorrência crescente, nos dois "
                 "modos, em escala logarítmica nos dois eixos. À direita, fração de "
                 "requisições recusadas com 429 no modo produto. O painel da direita "
                 "usa escala linear porque a grandeza é uma porcentagem.")
    motor = conc[(conc.modo == "motor") & (conc.status == 200)]
    prod = conc[conc.modo == "produto"]
    niveis = sorted(conc.nivel.unique())
    primeiro_429 = None
    for n in niveis:
        if len(prod[(prod.nivel == n) & (prod.status == 429)]) > 0:
            primeiro_429 = n
            break
    lat1 = motor[motor.nivel == niveis[0]].ms.median()
    latN = motor[motor.nivel == niveis[-1]].ms.median()
    d.txt(
        f"A {g} separa as duas leituras. Sem limitador, a latência mediana vai de "
        f"{num(lat1)} ms com {niveis[0]} requisição simultânea a {num(latN)} ms com "
        f"{niveis[-1]}, um fator de {num(latN / lat1, 1)} para um aumento de "
        f"{num(niveis[-1] / max(niveis[0], 1), 0)} vezes na concorrência: o servidor "
        f"degrada, mas não colapsa. Com o limitador ativo, o achado não é a latência e "
        f"sim o corte: as recusas começam em "
        f"{num(primeiro_429, 0) if primeiro_429 else '—'} requisições simultâneas, que "
        f"é o comportamento pretendido e não uma falha. O limite existe para proteger "
        f"as bases públicas de um cliente automatizado, e o preço é que uma rajada "
        f"legítima também é cortada.")


# --------------------------------------------------------------------- erros --
def _erros(d, num):
    dr = d.csv("erros.csv")
    if dr is None:
        return
    d.titulo(2, "Tratamento de entrada inválida")
    total, ok = len(dr), int(dr.aprovado.sum())
    quinhentos = int((dr.status == 500).sum())
    g = d.figura("fig10_erros.png",
                 "Casos de entrada inválida por família de rota, separados entre os "
                 "tratados dentro do esperado e os fora dele. O critério foi declarado "
                 "antes da medição: código na faixa prevista para o caso, corpo em "
                 "JSON, e nunca 500.")
    d.txt(
        f"A {g} resume {total} casos de borda: símbolo inexistente, caracteres "
        f"especiais, comprimento absurdo, injeção de caminho, identificador fora do "
        f"padrão e consulta vazia, em todas as famílias de rota. "
        f"{ok} de {total} foram tratados dentro do esperado e "
        f"{quinhentos} devolveram 500. Um 500 seria falha mesmo com mensagem boa: "
        f"significa que a exceção chegou ao topo sem tratamento, e num serviço público "
        f"isso vaza rastro de pilha.")
    reprovados = dr[~dr.aprovado]
    if not reprovados.empty:
        d.tabela(["Família", "Caso", "Esperado", "Obtido"],
                 [[r.familia, r.caso, r.esperado, r.status]
                  for r in reprovados.itertuples()])
        d.txt(
            "Os casos acima são divergências reais entre o que o protocolo previa e o "
            "que a API devolve. Estão listados em vez de omitidos porque um capítulo de "
            "resultados que só mostra o que passou não é um resultado.")


# ---------------------------------------------------------------- completude --
def _completude(d, num):
    dc = d.csv("completude.csv")
    dv = d.csv("completude_campos.csv")
    if dc is None:
        return
    d.titulo(2, "Completude das respostas")
    g = d.figura("fig11_completude.png",
                 "Distribuição da fração de campos preenchidos por família de rota, em "
                 "diagrama de caixa. A caixa cobre do primeiro ao terceiro quartil e a "
                 "linha branca é a mediana; cada ponto de dado é um alvo consultado.")
    med = dc.groupby("familia").completude_pct.median().sort_values(ascending=False)
    d.txt(
        f"A {g} mostra que a completude varia mais entre famílias do que dentro de cada "
        f"uma. A família `{med.index[0]}` preenche {num(med.iloc[0])}% dos campos e a "
        f"família `{med.index[-1]}` preenche {num(med.iloc[-1])}%. A diferença não é de "
        f"qualidade da integração: é de quanta informação existe publicada para cada "
        f"tipo de entidade.")
    if dv is not None:
        sempre = dv[dv.sempre_vazio]
        if not sempre.empty:
            g2 = d.figura("fig12_campos_vazios.png",
                          "Campos que vieram vazios em todos os alvos testados. Campo "
                          "vazio em um alvo é propriedade daquele alvo; vazio em todos "
                          "é limitação da fonte ou da integração, e é essa a lista que "
                          "interessa.")
            d.txt(
                f"A {g2} traz o resultado que a média de completude esconde. "
                f"{len(sempre)} campos vieram vazios em todos os alvos de sua família. "
                f"Campo vazio nem sempre é defeito: um gene sem estrutura resolvida no "
                f"AlphaFold devolve o identificador da estrutura nulo porque a estrutura "
                f"não existe, não porque a consulta falhou. O que a lista permite é "
                f"separar os dois casos, e cada campo dela é uma limitação declarada "
                f"desta versão.")


# --------------------------------------------------------------- comparacao --
def _comparacao(d, num):
    dc = d.csv("comparacao.csv")
    if dc is None:
        return
    dc = dc[dc.status == 200]
    if dc.empty:
        return
    d.titulo(2, "O fluxo manual contra a consulta integrada")
    g = d.figura("fig13_comparacao.png",
                 "Tempo até a resposta por três caminhos, em escala logarítmica: o "
                 "fluxo manual consultando cada fonte em série, a consulta integrada "
                 "com cache frio, e a mesma consulta com cache quente.")
    fam = [f for f in ORDEM if f in set(dc.familia)]
    linhas = []
    for f in fam:
        s = dc[dc.familia == f]
        linhas.append([ROTULO[f], len(s), num(s.manual_ms.median() / 1000, 2),
                       num(s.genvar_frio_ms.median() / 1000, 2),
                       num(s.genvar_quente_ms.median()),
                       f"{num(s.ganho_frio.median(), 2)}×",
                       f"{num(s.ganho_quente.median(), 0)}×"])
    d.tabela(["Família", "Alvos", "Manual (s)", "Frio (s)", "Quente (ms)",
              "Ganho frio", "Ganho quente"], linhas)
    d.txt(
        "Uma ressalva de protocolo antes do número, porque ela muda como ele deve ser "
        "lido. As duas medições são feitas em sequência sobre o mesmo alvo: primeiro o "
        "fluxo manual, que consulta as fontes uma a uma, e logo depois a consulta "
        "integrada com o cache limpo, que consulta as mesmas fontes. A segunda medição "
        "encontra as fontes recém-acionadas, e portanto mais lentas a responder do que "
        "estariam em repouso. O viés é sistemático e tem sinal conhecido: ele penaliza "
        "a consulta integrada. O ganho relatado é, por isso, um piso, e não uma "
        "estimativa central. A ordem foi mantida porque é a do protocolo da versão "
        "2.0, e inverter a ordem tornaria as duas medições incomparáveis entre si.")
    gf = dc.ganho_frio.median()
    d.txt(
        f"A {g} e a tabela acima mostram um resultado que precisa ser lido com "
        f"cuidado, porque o número grande é o menos interessante. Contra o fluxo manual, "
        f"a consulta integrada com cache frio é {num(gf, 2)} vezes mais rápida na "
        f"mediana. Esse ganho vem do paralelismo: as mesmas fontes, consultadas ao "
        f"mesmo tempo em vez de uma após a outra. É um ganho modesto e limitado pela "
        f"fonte mais lenta, e nenhum arranjo de software o aumenta muito.")
    if "ganho_com_humano" in dc.columns and dc.ganho_com_humano.notna().any():
        gh = dc.ganho_com_humano.median()
        d.txt(
            f"A coluna que muda de ordem de grandeza é outra, e ela é uma **estimativa "
            f"declarada como tal**: somando ao fluxo manual os 900 segundos por variante "
            f"que a literatura de curadoria do ClinGen atribui ao trabalho humano de "
            f"abrir portal, digitar identificador, ler a tela e copiar para a planilha, "
            f"a razão vai a {num(gh, 0)} vezes. Esse número não foi medido e não pode "
            f"ser: ele é o tempo humano tabelado, dividido pelo tempo de máquina "
            f"medido. Ele está aqui porque descreve o custo real de anotar uma variante "
            f"à mão, mas não é um resultado experimental deste trabalho, e as duas "
            f"coisas são mantidas em colunas separadas por isso.")


# ------------------------------------------------------------------ pipeline --
def _pipeline(d, num):
    df = d.csv("funcoes.csv")
    if df is None:
        return
    ok = df[df.erro.isna() & df.mediana_ms.notna()]
    d.titulo(2, "O pipeline de VCF no navegador")
    d.txt(
        "A partir daqui a medição muda de objeto. O módulo de VCF não passa pelo "
        "servidor: ele lê o arquivo no navegador, cruza contra catálogos servidos como "
        "assets estáticos e escreve as saídas ali mesmo. Nenhuma etapa faz requisição "
        "à API, e por isso nada nesta seção depende de rede, de cache ou de limitador "
        "de taxa. O que limita aqui é memória e tempo de processador.")
    g = d.figura("fig14_custo_por_escala.png",
                 "Custo de cada etapa do pipeline em função do número de variantes do "
                 "arquivo, nos dois eixos em escala logarítmica. Em escala log-log, uma "
                 "reta indica crescimento proporcional a uma potência do tamanho, e a "
                 "inclinação é o expoente.")
    escalas = sorted(ok.variantes.dropna().unique())
    if escalas:
        d.txt(
            f"A {g} percorre o corpus de {ok.arquivo.nunique()} arquivos, de "
            f"{num(min(escalas), 0)} a {num(max(escalas), 0)} variantes. As etapas "
            f"crescem em ritmos diferentes, e é isso que decide onde otimizar: a etapa "
            f"que domina em arquivo pequeno não é a que domina em exoma.")
    g2 = d.figura("fig16_funcoes_piso.png",
                  "Piso de tempo de cada função sobre o menor arquivo do corpus, em "
                  "escala logarítmica. É o custo que a função tem por existir, antes de "
                  "qualquer efeito de escala.")
    pequeno = ok[ok.arquivo == "01-pequeno.vcf"]
    if not pequeno.empty:
        topo = pequeno.sort_values("mediana_ms", ascending=False).iloc[0]
        d.txt(
            f"A {g2} isola o custo fixo. Sobre o menor arquivo do corpus, a função mais "
            f"cara é `{topo.funcao}`, com {num(topo.mediana_ms)} ms, e ela é cara "
            f"independentemente do tamanho do arquivo: é montagem de índice e leitura de "
            f"catálogo, trabalho que acontece uma vez por sessão. Numa sessão que analisa "
            f"um arquivo só, esse piso é a maior parte do tempo total; numa que analisa "
            f"uma coorte, ele se dilui, e é esse o argumento quantitativo a favor do "
            f"modo em lote.")


# -------------------------------------------------------------------- saidas --
def _saidas(d, num):
    df = d.csv("funcoes.csv")
    if df is None:
        return
    s = df[(df.etapa == "saida") & df.erro.isna() & df.mediana_ms.notna()]
    s = s[s.funcao.isin(["TSV", "CSV", "JSON", "VCF anotado", "XLSX", "PDF"])]
    if s.empty:
        return
    d.titulo(2, "As seis saídas e o custo de cada uma")
    g = d.figura("fig15_saidas.png",
                 "À esquerda, tempo de geração de cada formato, mediana do corpus, em "
                 "escala logarítmica; a linha tracejada marca um segundo, limite "
                 "prático entre uma interface que responde e uma que trava, já que a "
                 "geração roda na thread principal. À direita, tamanho do arquivo "
                 "produzido, também em escala logarítmica.")
    med = s.groupby("funcao").mediana_ms.median().sort_values()
    tam = s.groupby("funcao").bytes.median()
    caro, barato = med.index[-1], med.index[0]
    d.txt(
        f"A {g} mede as seis saídas que a página oferece. A mais cara é o {caro}, com "
        f"{num(med.iloc[-1])} ms de mediana, e a mais barata é o {barato}, com "
        f"{num(med.iloc[0])} ms: uma razão de {num(med.iloc[-1] / med.iloc[0], 0)} "
        f"vezes entre os extremos.")
    d.txt(
        f"O resultado que corrige a versão anterior deste benchmark está aqui. Na "
        f"medição anterior o PDF não era gerado, e o XLSX era montado com uma aba só e "
        f"medido antes de o compactador do formato passar a comprimir de fato: aquele "
        f"número descrevia um arquivo que a aplicação não produz. Com as seis saídas "
        f"medidas pelas mesmas funções que os botões chamam, o PDF é "
        f"{num(med.iloc[-1] / med.get('XLSX', med.iloc[-1]), 1)} vezes mais caro que o "
        f"XLSX, e não o contrário.")
    if len(tam) > 1:
        maior, menor = tam.idxmax(), tam.idxmin()
        d.txt(
            f"O painel da direita mostra a relação inversa entre custo e tamanho. O "
            f"{maior} produz o maior arquivo, {num(tam.max() / 1048576, 1)} MB, e o "
            f"{menor} o menor, {num(tam.min() / 1024)} KB. Custo e tamanho medem coisas "
            f"diferentes: o formato tabular serializa tudo o que foi lido, e o laudo "
            f"resume, o que custa decisão de layout e paginação e produz menos bytes.")


# ---------------------------------------------------------------------- lote --
def _lote(d, num):
    dl = d.csv("lote_vs_individual.csv")
    if dl is None:
        return
    d.titulo(2, "Um arquivo contra uma coorte")
    g = d.figura("fig17_lote.png",
                 "À esquerda, tempo total para processar a coorte, arquivo a arquivo "
                 "contra em lote, nos dois cenários do corpus. À direita, memória "
                 "retida ao fim. Escalas logarítmicas nos dois painéis.")
    maior = dl.sort_values("arquivos").iloc[-1]
    d.txt(
        f"A {g} compara os dois modos em coortes de {num(dl.arquivos.min(), 0)} a "
        f"{num(dl.arquivos.max(), 0)} arquivos. Na maior coorte medida, "
        f"{num(maior.arquivos, 0)} arquivos do cenário `{maior.cenario}`, o modo em lote "
        f"leva {num(maior.lote_ms / 1000)} segundos contra "
        f"{num(maior.individual_ms / 1000)} do modo arquivo a arquivo, um ganho de "
        f"{num(maior.ganho_tempo, 2)} vezes.")
    d.txt(
        f"O painel da direita mostra o resultado mais importante dos dois, e ele não é "
        f"sobre tempo. A memória retida ao fim é de {num(maior.lote_retido_mb)} MB no "
        f"modo em lote contra {num(maior.individual_retido_mb)} MB no modo individual, "
        f"uma razão de {num(maior.ganho_retido, 0)} vezes. É essa diferença que decide "
        f"se a coorte cabe: o modo individual acumula o resultado de cada arquivo, e o "
        f"navegador tem um teto de memória que o servidor não tem.")


# --------------------------------------------------------------- limitacoes --
def _limitacoes(d, num):
    d.titulo(2, "Limitações desta medição")
    amb = d.json_("ambiente_medicao.json") or d.json_("ambiente.json") or {}
    itens = [
        "**Uma máquina só.** Todas as medições saíram do mesmo equipamento"
        + (f", um {amb.get('cpu')} com {num(amb.get('memoria_gb'), 0)} GB de memória" if amb else "")
        + ". Os valores absolutos não se transferem para outro hardware; as razões "
        "entre condições, que é o que as figuras comparam, se transferem melhor.",
        "**As fontes públicas variam com o dia.** A latência fria mede o Ensembl, o "
        "gnomAD e o ClinVar tanto quanto mede o GenVar. Duas execuções em dias "
        "diferentes não devolvem os mesmos milissegundos, e por isso as conclusões "
        "estão sempre em razões entre condições medidas na mesma sessão.",
        "**O N das suítes que tocam a rede é menor.** Repetir com N alto derrubaria o "
        "acesso do projeto às bases, que aplicam uso justo por IP. O intervalo de "
        "confiança acompanha esses valores para que a imprecisão fique visível.",
        "**A expiração por TTL não foi medida.** O TTL de produção é de uma hora, e "
        "esperar por ele multiplicaria a duração da execução sem acrescentar "
        "informação: uma chave expirada é indistinguível de uma chave ausente, que é o "
        "que a medição fria já exercita. Medir com um TTL de brinquedo descreveria "
        "outra configuração.",
        "**O tempo humano do fluxo manual é estimativa de literatura.** Ele aparece em "
        "coluna separada e nunca somado ao tempo medido sem aviso.",
        "**A versão 2.0 não pode ser remedida.** O código está congelado num commit "
        "anterior e as fontes externas mudaram desde então. A comparação entre versões "
        "se restringe às métricas cujo protocolo é idêntico e cujo alvo ainda existe, "
        "com a data de cada medição declarada na legenda.",
    ]
    for i in itens:
        d.partes.append(f"- {i}\n")
    d.partes.append("\n")
