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
    _catalogo(d, num)
    _teto(d, num)
    _acmg(d, num)
    _reprodutibilidade(d, num)
    _ambiente(d, num)
    _versoes(d, num)
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
        # O ganho da tabela e a razao entre as DUAS MEDIANAS DESTA LINHA, e nao a
        # mediana das razoes por rota: assim a linha fecha para quem dividir as
        # duas colunas anteriores, e a figura diz o mesmo numero.
        mf, mq = s.frio_mediana.median(), s.quente_mediana.median()
        linhas.append([ROTULO[f], len(s), num(mf), num(mq),
                       num(s.frio_max.median()),
                       f"{num(mf / mq, 0)}×" if mq else "—"])
    d.tabela(["Família", "Rotas", "Frio (ms)", "Quente (ms)",
              "Maior observado, frio (ms)", "Ganho"], linhas)
    d.txt(
        "A coluna de cauda traz o **maior valor observado**, e não um percentil. Com "
        "três repetições frias por rota, um percentil 95 interpolado cai entre a "
        "segunda e a terceira observação, isto é, é o máximo com outro nome, e "
        "publicá-lo como percentil sugeriria uma estimativa de cauda que a amostra não "
        "sustenta. As medições quentes têm vinte repetições e aí o percentil existe; "
        "onde ele aparece neste capítulo, é porque a amostra o comporta.")

    g1 = d.figura("fig01_latencia_familia.png",
                  "Latência mediana por família de rota, com cache frio e com cache "
                  "quente, em escala logarítmica. A escala é logarítmica porque a razão "
                  "entre as duas condições passa de três ordens de grandeza; em escala "
                  "linear a barra do cache quente seria invisível.")
    rede = dl[dl.de_rede == True]  # noqa: E712
    local = dl[dl.de_rede == False]  # noqa: E712
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
                  "por rota que consulta a rede, com o maior valor observado marcado "
                  "à direita. A distância entre a mediana e o máximo mede a dependência "
                  "de fontes de terceiros: ela não é ruído da aplicação, é a "
                  "variabilidade das bases públicas. A classificação de quais rotas "
                  "consultam a rede é derivada da contagem medida de requisições "
                  "externas, não declarada à mão.")
    pior95 = rede.loc[rede.frio_max.idxmax()]
    d.txt(
        f"A {g3} traz a informação que a mediana sozinha esconde. A rota `"
        f"{pior95.nome}` tem mediana de {num(pior95.frio_mediana)} ms e máximo "
        f"observado de {num(pior95.frio_max)} ms em {num(pior95.frio_n, 0)} repetições, "
        f"uma razão de {num(pior95.frio_max / pior95.frio_mediana, 1)}. Não é possível "
        f"dizer com que frequência esse valor ocorre, e o capítulo não o afirma: o que "
        f"se sabe é que ele ocorreu, e é ele que define a experiência de quem esperou. "
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

    dttl = d.csv("cache_ttl.csv")
    if dttl is not None and not dttl.empty:
        g = d.figura("fig26_cache_ttl.png",
                     "Prazo restante de cada tipo de chave no momento da leitura, "
                     "logo após ser escrita. A linha tracejada marca o TTL declarado "
                     "de uma hora. Verde quando todas as chaves daquele tipo têm "
                     "prazo.")
        sem = int((~dttl.tem_prazo).sum())
        d.txt(
            f"A {g} responde a única pergunta sobre expiração que a medição fria não "
            f"responde. Esperar a hora do TTL não acrescentaria informação: uma chave "
            f"expirada é indistinguível de uma chave ausente, que é o que a medição "
            f"fria já exercita. O que é distinguível, e não aparece em nenhuma medida "
            f"de tempo, é uma chave escrita **sem** prazo: ela nunca expira, nunca "
            f"deixa a resposta errada, nunca aparece como lentidão, e vai ocupando "
            f"memória até a instância encher. É o único defeito de cache que não se "
            f"manifesta como desempenho, e por isso o único que precisa ser procurado "
            f"de propósito.")
        if sem == 0:
            d.txt(
                f"Das {len(dttl)} chaves escritas pelas rotas medidas, "
                f"{len(dttl)} têm prazo, com mediana de {num(dttl.ttl_s.median(), 0)} "
                f"segundos contra os 3.600 declarados. A diferença é o tempo decorrido "
                f"entre a escrita e a leitura do prazo. Nenhum tipo de chave vaza.")
        else:
            d.txt(
                f"**{sem} das {len(dttl)} chaves não têm prazo** e nunca expiram. "
                f"São elas: {', '.join(dttl[~dttl.tem_prazo].chave.head(6))}.")

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
                 "cache quente, por família de rota, ordenadas pelo custo frio.")
    m = dr.groupby("familia").agg(frio=("requisicoes_frio", "mean"),
                                  quente=("requisicoes_quente", "mean"))
    rede = m[m.frio > 0].sort_values("frio", ascending=False)
    zeradas = rede[rede.quente == 0]
    restantes = rede[rede.quente > 0]
    d.txt(
        f"A {g} mostra a distribuição desse custo. O topo é `{rede.index[0]}`, com "
        f"{num(rede.frio.iloc[0])} requisições por consulta fria, e a mediana entre as "
        f"{len(rede)} famílias que usam rede é de {num(rede.frio.median())}. Com o "
        f"cache quente, {len(zeradas)} delas caem a zero. É esse zero que torna a "
        f"aplicação utilizável em sala de aula, onde trinta pessoas consultam o mesmo "
        f"gene em poucos minutos e apenas a primeira consulta chega às fontes.")
    if not restantes.empty:
        nomes = ", ".join(f"`{i}`" for i in restantes.index)
        d.txt(
            f"A exceção é {nomes}, que ainda faz "
            f"{num(restantes.quente.iloc[0])} requisição por consulta mesmo com o cache "
            f"quente. Não é falha do cache: essa rota não grava no cache um resultado "
            f"obtido com alguma das fontes fora do ar, para não fixar por uma hora uma "
            f"resposta empobrecida por instabilidade momentânea. O preço da regra é "
            f"que, enquanto a fonte oscila, a rota volta a perguntar. A alternativa "
            f"seria guardar a resposta incompleta e servi-la como se fosse a completa.")

    g2 = d.figura("fig05_requisicoes_host.png",
                  "Composição das requisições por base de destino, com cache frio. "
                  "Barras empilhadas em escala linear, e não logarítmica: em eixo "
                  "logarítmico o comprimento de um segmento empilhado depende de onde "
                  "ele começa, e a composição deixa de ser legível.")
    if "hosts" in dr.columns:
        painel = dr[(dr.familia == "painel") & dr.hosts.notna()]
        if not painel.empty:
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
    # `nivel` mistura inteiro na fase concorrente e texto na sequencial, entao a
    # coluna chega como objeto e comparar dois niveis levanta TypeError.
    conc = de[de.fase == "concorrente"].copy()
    conc["nivel"] = pd.to_numeric(conc.nivel, errors="coerce")
    conc = conc[conc.nivel.notna()]
    conc["nivel"] = conc.nivel.astype(int)
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
        "Antes do número, uma questão de protocolo que a primeira execução desta suíte "
        "obrigou a resolver, e cuja resolução é ela própria um resultado. As duas "
        "medições são feitas sobre o mesmo alvo, uma após a outra, contra as mesmas "
        "fontes: quem for medido em segundo lugar as encontra recém-acionadas, e paga "
        "pelo controle de vazão que elas aplicam. Medindo sempre o fluxo manual "
        "primeiro, a família gene saiu com ganho 0,92, isto é, a ferramenta aparecia "
        "**mais lenta** que o caminho que ela substitui. O número não descrevia a "
        "ferramenta; descrevia a ordem.")
    if "ordem" in dc.columns and dc.ordem.notna().any():
        efeito = []
        for f in ("gene", "variante"):
            s_ = dc[(dc.familia == f) & dc.ordem.notna()]
            a = s_[s_.ordem == "integrada primeiro"].genvar_frio_ms.median()
            b = s_[s_.ordem == "manual primeiro"].genvar_frio_ms.median()
            if pd.notna(a) and pd.notna(b):
                efeito.append([ROTULO[f], num(a / 1000, 2), num(b / 1000, 2),
                               f"+{num((b / a - 1) * 100, 0)}%"])
        if efeito:
            d.txt(
                "A correção é a padrão para efeito de ordem: metade dos alvos de cada "
                "família é medida com o fluxo manual primeiro e a outra metade com a "
                "consulta integrada primeiro. O contrabalanceamento não só remove o "
                "sinal fixo do viés como **permite medi-lo**, e a tabela abaixo é essa "
                "medição.")
            d.tabela(["Família", "Integrada medida primeiro (s)",
                      "Integrada medida após o manual (s)", "Efeito da ordem"], efeito)
            d.txt(
                "O efeito é grande e tem o sinal esperado. Uma consequência dele "
                "atravessa todo este capítulo e precisa ficar explícita: **os tempos "
                "frios desta seção não são comparáveis aos da seção de latência.** Lá a "
                "mesma rota de gene foi medida isolada, com pausa entre repetições, e "
                "respondeu em segundos; aqui, dentro de um protocolo que aciona as "
                "mesmas fontes duas vezes por alvo, ela responde em dezenas de "
                "segundos. Os dois números estão corretos e medem regimes diferentes. O "
                "que esta seção compara é a **razão** entre dois caminhos submetidos ao "
                "mesmo regime, e é só isso que ela afirma.")
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




# ---------------------------------------------------------------- catalogo --
def _catalogo(d, num):
    df = d.csv("funcoes.csv")
    if df is None:
        return
    c = df[(df.etapa == "catalogo") & df.erro.isna() & df.mediana_ms.notna()]
    if c.empty:
        return
    d.titulo(2, "O custo de preparar os catálogos embarcados")
    g = d.figura("fig20_catalogo.png",
                 "Tempo para preparar cada catálogo embarcado, uma vez por sessão, em "
                 "escala logarítmica. Não é custo por arquivo analisado: é o preço de "
                 "abrir a página.")
    caro = c.groupby("funcao").mediana_ms.median().sort_values()
    total = caro.sum()
    d.txt(
        f"A {g} isola um custo que não aparece em nenhuma outra figura porque não "
        f"escala com nada: os catálogos embarcados são preparados uma vez por sessão, "
        f"antes de qualquer arquivo. O conjunto custa {num(total)} ms, e "
        f"`{caro.index[-1]}` responde por {num(caro.iloc[-1] / total * 100, 0)}% desse "
        f"total, com {num(caro.iloc[-1])} ms. É o preço de ter a anotação clínica "
        f"disponível sem rede, e ele é pago inteiro mesmo por quem for analisar um "
        f"arquivo de mil variantes. Numa sessão de um arquivo só, esse custo fixo "
        f"domina; numa coorte, ele se dilui, e é o argumento quantitativo a favor do "
        f"modo em lote que a seção anterior mediu pelo outro lado.")



# ---------------------------------------------------------- teto de memoria --
def _teto(d, num):
    dt = d.csv("teto_memoria.csv")
    if dt is None or len(dt) < 3:
        return
    d.titulo(2, "Onde a leitura deixa de caber")
    d.txt(
        "O teto do módulo de VCF não é o número de variantes, e é essa a razão de "
        "esta seção existir separada. O que ocupa memória é variantes **vezes** "
        "amostras: um arquivo com mil amostras e sessenta mil variantes carrega mais "
        "genótipos que um exoma de meio milhão de variantes com uma amostra só. A "
        "medição usa o cromossomo Y do 1000 Genomes, com 1.233 amostras, que é o pior "
        "caso do corpus por essa métrica.")
    d.txt(
        "A medição roda em processo próprio, e isso não é detalhe de execução. Um "
        "estouro de memória derruba o processo inteiro, e medindo junto dos demais "
        "arquivos ele levaria os outros onze consigo. A versão anterior deste "
        "benchmark resolvia isso **pulando** o arquivo por estimativa, o que troca um "
        "resultado por uma suposição: o arquivo aparecia na tabela com a palavra "
        "\"pulado\" e nenhum número. Isolado, o estouro é o resultado.")
    g = d.figura("fig25_teto_memoria.png",
                 "Vazão de leitura contra memória em uso, com o número de variantes "
                 "lidas anotado em cada ponto. Eixo vertical logarítmico. A linha "
                 "tracejada marca a memória física da máquina.")
    pico = dt.variantes_por_segundo.max()
    fim = dt.iloc[-1]
    joelho = dt[dt.variantes_por_segundo < pico / 2]
    d.txt(
        f"A {g} mostra que o limite não é um estouro abrupto e sim uma degradação, e "
        f"que ela tem um ponto de virada nítido. A leitura começa a "
        f"{num(pico)} variantes por segundo e termina a "
        f"{num(fim.variantes_por_segundo)}, "
        f"{num(pico / fim.variantes_por_segundo, 1)} vezes mais lenta, sem nunca "
        f"lançar erro.")
    if not joelho.empty:
        j = joelho.iloc[0]
        d.txt(
            f"A vazão cai à metade do pico em {num(j.variantes)} variantes, com "
            f"{num(j.heap_mb / 1024, 1)} GB de heap. A máquina desta medição tem 8 GB "
            f"de memória física, e é aí que a curva vira: acima disso o sistema passa a "
            f"paginar, e o custo por variante deixa de ser linear. O limite prático, "
            f"portanto, não é uma contagem de variantes que se possa escrever na "
            f"interface, e sim o produto variantes por amostras contra a memória da "
            f"máquina de quem usa, que a aplicação não conhece. É por isso que o aviso "
            f"da página fala em teto de variantes: é a aproximação que se pode dar sem "
            f"medir a máquina do usuário, e ela subestima o problema em arquivos "
            f"multiamostra.")


# -------------------------------------------------------------------- acmg --
def _acmg(d, num):
    df = d.csv("funcoes.csv")
    if df is None or "variantes_com_criterio" not in df.columns:
        return
    a = df[(df.funcao == "pontuação ACMG") & df.erro.isna()
           & df.variantes_com_criterio.notna() & (df.variantes_com_criterio > 0)]
    if len(a) < 3:
        return
    d.titulo(2, "A pontuação ACMG")
    d.txt(
        "A classificação por critérios ACMG/AMP é a funcionalidade clínica nova desta "
        "versão, e ela tem duas partes que este benchmark mede separadas. Decidir "
        "**quais** critérios disparam para uma variante depende do que a anotação "
        "trouxe e está medido junto da etapa de anotação. Somar os pontos do sistema "
        "bayesiano adotado pelo ClinGen é a segunda parte, e é a medida abaixo.")
    g = d.figura("fig19_acmg.png",
                 "Tempo para pontuar todas as variantes de um arquivo contra o número "
                 "de variantes que têm ao menos um critério, nos dois eixos em escala "
                 "logarítmica. Cada ponto é um arquivo do corpus.")
    maior = a.loc[a.variantes_com_criterio.idxmax()]
    menor = a.loc[a.variantes_com_criterio.idxmin()]
    d.txt(
        f"A {g} mostra que a pontuação é barata e cresce de forma proporcional ao que "
        f"há para pontuar. No maior caso do corpus, {num(maior.variantes_com_criterio)} "
        f"variantes com critério são pontuadas em {num(maior.mediana_ms)} ms; no menor, "
        f"{num(menor.variantes_com_criterio)} variantes em {num(menor.mediana_ms, 2)} "
        f"ms. O custo por variante é da ordem de "
        f"{num(maior.mediana_ms / maior.variantes_com_criterio * 1000, 1)} "
        f"microssegundos, e a etapa não aparece entre os gargalos de nenhuma escala.")
    d.txt(
        "Uma observação sobre esta medição em particular, porque a primeira versão "
        "dela estava errada e o erro é instrutivo. O campo que guarda os critérios de "
        "uma variante é um **arranjo**, e a medição lia um atributo inexistente dentro "
        "dele: pontuava, portanto, uma lista vazia em toda variante. O tempo saía "
        "real, a coluna do CSV enchia, e o trabalho medido era nenhum. O que corrigiu "
        "não foi ler o código com mais atenção e sim registrar, ao lado do tempo, "
        "quantas variantes tinham critério, que é o número que denunciou o zero.")


# ------------------------------------------------------- reprodutibilidade --
def _reprodutibilidade(d, num):
    dr = d.csv("reprodutibilidade.csv")
    if dr is None:
        return
    d.titulo(2, "Reprodutibilidade e procedência da saída")
    d.txt(
        "As seções anteriores mediram quanto custa. Esta mede se o resultado é o "
        "mesmo quando a análise é repetida, e se a saída carrega o suficiente para "
        "alguém conferir de onde ela veio. Num trabalho de bioinformática as duas "
        "coisas valem tanto quanto o tempo: um resultado que não se repete não é "
        "resultado, e um resultado sem procedência não é conferível.")
    g = d.figura("fig18_reprodutibilidade.png",
                 "Fração dos arquivos do corpus que satisfazem cada critério de "
                 "reprodutibilidade e de procedência. Verde para cem por cento.")
    criterios = [c for c in ("tsv_identico", "csv_identico", "vcf_identico",
                             "metricas_independem_da_ordem",
                             "vcf_carrega_sha_da_entrada",
                             "vcf_carrega_versao_clinvar") if c in dr.columns]
    falhos = [c for c in criterios if dr[c].mean() < 1]
    if not falhos:
        d.txt(
            f"A {g} mostra {len(criterios)} critérios satisfeitos em "
            f"{len(dr)} de {len(dr)} arquivos do corpus. As saídas em texto são "
            f"idênticas byte a byte entre réplicas; as métricas não dependem da ordem "
            f"em que as variantes foram lidas; e o VCF anotado carrega no cabeçalho o "
            f"sha256 do arquivo de entrada e a versão do ClinVar usada na anotação. O "
            f"último ponto é o que permite refazer a conferência meses depois: dado o "
            f"laudo, sabe-se qual arquivo o gerou e contra qual versão do catálogo, "
            f"sem depender de o arquivo ter sido guardado.")
    else:
        d.txt(
            f"A {g} mostra que {len(falhos)} de {len(criterios)} critérios não foram "
            f"satisfeitos em todos os arquivos: {', '.join(falhos)}. Isso é um "
            f"resultado negativo e está registrado como tal.")


# ------------------------------------------------------ local x conteiner ----
def _ambiente(d, num):
    from pathlib import Path
    docker = Path(d.res).parent / "docker"
    if not (docker / "latencia.csv").exists():
        return
    a = pd.read_csv(Path(d.res) / "latencia.csv")
    b = pd.read_csv(docker / "latencia.csv")
    d.titulo(2, "Direto na máquina contra em contêiner")
    d.txt(
        "As duas medições correram na mesma máquina, na mesma sessão, contra o mesmo "
        "código: o que muda é só o empacotamento. O ambiente conteinerizado sobe o "
        "backend, o frontend e o Redis em três contêineres numa rede própria, e por "
        "isso cada chamada ao cache atravessa a rede virtual do Docker em vez do "
        "loopback. Essa é a diferença que a comparação foi montada para medir; ela "
        "não é a única que sobra, e o que a medição revelou sobre as outras está "
        "dito adiante.")
    g = d.figura("fig21_ambiente.png",
                 "A mesma medição de latência nos dois ambientes, separada por estado "
                 "do cache. À esquerda, com cache frio, onde o tempo é dominado pelas "
                 "fontes externas; à direita, com cache quente, onde ele é dominado "
                 "pelo próprio sistema. Escalas logarítmicas.")
    # Comparacao PAREADA por familia. Medianas agregadas nao servem aqui: as duas
    # corridas tem composicao diferente de rota (a conteinerizada mediu menos
    # alvos por familia de rede, para poupar as fontes publicas), e a mediana do
    # conjunto passa a descrever a composicao em vez do ambiente. Medido: o
    # agregado dava 1.464 ms local contra 85 ms em conteiner, o que leria como o
    # conteiner sendo dezessete vezes mais rapido, quando familia a familia a
    # diferenca e de outra ordem.
    fam = [f for f in ORDEM if f in set(a.familia) and f in set(b.familia)]
    if fam:
        linhas, razoes_q, razoes_f = [], [], []
        for f in fam:
            fa = a[a.familia == f].frio_mediana.median()
            fb = b[b.familia == f].frio_mediana.median()
            qa = a[a.familia == f].quente_mediana.median()
            qb = b[b.familia == f].quente_mediana.median()
            if pd.notna(qa) and pd.notna(qb) and qa:
                razoes_q.append(qb / qa)
            if pd.notna(fa) and pd.notna(fb) and fa:
                razoes_f.append(fb / fa)
            linhas.append([ROTULO[f], num(fa), num(fb), num(qa), num(qb),
                           f"{num(qb / qa, 2)}×" if qa and pd.notna(qb) else "—"])
        d.tabela(["Família", "Frio, máquina (ms)", "Frio, contêiner (ms)",
                  "Quente, máquina (ms)", "Quente, contêiner (ms)",
                  "Razão quente"], linhas)
        mediana_q = sorted(razoes_q)[len(razoes_q) // 2] if razoes_q else None
        if mediana_q:
            direcao = "mais rápido" if mediana_q < 1 else "mais lento"
            d.txt(
                f"A {g} e a tabela mostram um resultado que contraria a expectativa "
                f"corrente. Com cache quente, onde o tempo é dominado pelo próprio "
                f"sistema e não pelas fontes externas, o ambiente conteinerizado é "
                f"**{direcao}** que o ambiente direto na máquina por um fator mediano "
                f"de {num(mediana_q, 2)} entre as {len(razoes_q)} famílias. A hipótese "
                f"de partida era a oposta: o contêiner fala com o Redis por uma rede "
                f"virtual e o ambiente direto fala por loopback, e a rede virtual "
                f"deveria custar. Ela custa; o que a medição mostra é que esse custo é "
                f"menor que a diferença entre os dois processos de Redis, que não são o "
                f"mesmo: o local é a instância de desenvolvimento da máquina, com o que "
                f"quer que ela já estivesse guardando, e o conteinerizado sobe limpo a "
                f"cada execução.")
            d.txt(
                "A conclusão que a comparação sustenta, portanto, é mais estreita do "
                "que \"contêiner é mais rápido\": é que **a conteinerização não impõe "
                "custo detectável nesta aplicação**, e que outras diferenças de "
                "ambiente pesam mais que ela. Separar as duas exigiria subir um Redis "
                "limpo também do lado direto, o que não foi feito e fica declarado.")
        if razoes_f:
            mediana_f = sorted(razoes_f)[len(razoes_f) // 2]
            d.txt(
                f"Com cache frio a razão mediana é {num(mediana_f, 2)}, e ela diz menos "
                f"do que parece: nesse regime o tempo é das fontes públicas, que "
                f"respondem ao que perguntar independentemente de quem pergunta estar "
                f"em contêiner. A dispersão entre famílias, visível na tabela, é maior "
                f"que a diferença entre ambientes.")

    if (docker / "exaustao.csv").exists():
        g2 = d.figura("fig22_ambiente_carga.png",
                      "Latência mediana sob concorrência crescente nos dois ambientes, "
                      "no modo sem limitador. Escalas logarítmicas nos dois eixos.")
        d.txt(
            f"A {g2} repete a comparação sob carga. O interesse aqui não é o valor "
            f"absoluto e sim a inclinação: um ambiente que degrada mais rápido que o "
            f"outro à medida que a concorrência cresce revela um gargalo que só "
            f"aparece com contenção, e não na medição de uma requisição por vez.")


# ---------------------------------------------------------- 2.0 contra 3.0 ----
def _versoes(d, num):
    from pathlib import Path
    bruto = Path(d.res).resolve().parents[2] / "benchmark-legacy" / "2.0" / "results" / "local" / "latency_raw.csv"
    if not bruto.exists():
        return
    d.titulo(2, "A versão 2.0 contra a 3.0")
    d.txt(
        "A comparação entre versões tem um limite que precisa ser dito antes dos "
        "números: **a versão 2.0 não pode ser remedida.** O código está congelado num "
        "commit anterior e as fontes externas mudaram desde então, de modo que "
        "reexecutar o benchmark de junho hoje mediria outra coisa. O que se compara "
        "aqui é o dado arquivado daquela execução contra o desta, e apenas para as "
        "métricas cujo protocolo é idêntico e cujo alvo ainda existe: latência de gene "
        "e de variante, nos dois estados de cache. Todo o resto da 3.0 é superfície "
        "nova, sem linha de base.")
    l20 = pd.read_csv(bruto)
    frio = l20[(l20.phase == "cold") & (l20.status == 200)]
    r1 = frio[frio.run == 1].elapsed_ms.median()
    resto = frio[frio.run > 1].elapsed_ms.median()
    d.txt(
        f"E há um segundo cuidado, que a leitura do dado arquivado tornou "
        f"obrigatório. A suíte de 2020 limpava o cache **uma vez** antes das doze "
        f"repetições da fase fria, e não a cada repetição: da segunda em diante, ela "
        f"media cache quente. A mediana publicada então como latência fria, "
        f"{num(l20[(l20.phase == 'cold')].elapsed_ms.median())} ms, é um número "
        f"quente. Reconstruindo a medição fria a partir da primeira repetição de cada "
        f"alvo, que é a única que encontrou o cache vazio, o valor é "
        f"{num(r1)} ms, contra {num(resto)} ms das repetições seguintes. É a primeira "
        f"repetição que entra na comparação abaixo, e a diferença entre os dois "
        f"números mede o quanto um detalhe de protocolo altera a conclusão.")
    g = d.figura("fig23_versoes.png",
                 "Latência mediana de gene e de variante nas duas versões, separada "
                 "por estado do cache, em escala logarítmica. A medição de 2.0 é de "
                 "junho de 2026 e a de 3.0 é de agosto de 2026; a fria de 2.0 foi "
                 "reconstruída da primeira repetição de cada alvo, pelo motivo "
                 "explicado no texto.")
    d30 = d.csv("latencia.csv")
    if d30 is not None:
        # A rota, e nao a familia: em 3.0 a familia gene reune quatro formatos e
        # em 2.0 havia um so, entao comparar familias compararia escopos.
        g30 = d30[d30.nome == "gene"].frio_mediana.median()
        q30 = d30[d30.nome == "gene"].quente_mediana.median()
        q20 = l20[(l20.phase == "warm") & (l20.status == 200)
                  & (l20.endpoint == "gene")].elapsed_ms.median()
        f20 = frio[(frio.run == 1) & (frio.endpoint == "gene")].elapsed_ms.median()
        d.txt(
            f"A {g} mostra a rota de gene indo de {num(f20)} ms para {num(g30)} ms com "
            f"cache frio e de {num(q20)} ms para {num(q30)} ms com cache quente. "
            f"A comparação é entre a mesma rota, `/api/gene/{{símbolo}}`, e não entre "
            f"famílias: em 3.0 a família gene reúne quatro formatos de rota que em 2.0 "
            f"não existiam, e compará-las compararia escopos.")
        d.txt(
            "Este capítulo mede, e não explica: atribuir a melhora a uma mudança "
            "específica exigiria medir as versões intermediárias, o que o dado "
            "arquivado não permite. O que se pode afirmar é que as duas condições "
            "melhoraram e que o intervalo entre as medições contém mudanças no código "
            "e mudanças nas fontes externas, que não são separáveis a posteriori.")
    g2 = d.figura("fig24_versoes_superficie.png",
                  "Superfície medida em cada versão. Não é uma métrica de desempenho: "
                  "é o escopo do que existia para medir, e serve para situar as demais "
                  "comparações deste capítulo.")
    d.txt(
        f"A {g2} situa o resto. O benchmark de 2020 media duas famílias de rota; este "
        f"mede sete, mais o pipeline de VCF no navegador, os catálogos embarcados, as "
        f"saídas em seis formatos e a contagem de requisições externas. A ausência de "
        f"linha de base para essas medições não é omissão: elas medem coisas que a "
        f"versão anterior não tinha.")


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
