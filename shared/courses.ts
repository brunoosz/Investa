import type { CourseModule } from "./learning";

export const COURSES: CourseModule[] = [
  {
    id: "primeiros-passos",
    title: "Primeiros passos",
    description: "O que é investir, como o dinheiro cresce e por onde começar com segurança.",
    icon: "footprints",
    color: "#4F8CFF",
    level: "Iniciante",
    lessons: [
      {
        id: "o-que-e-investir",
        title: "O que é investir?",
        minutes: 4,
        cards: [
          {
            title: "Investir é colocar o dinheiro para trabalhar",
            body: "Investir é aplicar o dinheiro que sobra hoje para ter **mais dinheiro no futuro**. Em vez de deixar parado na conta, você empresta para alguém (governo, banco, empresa) ou vira sócio de um negócio — e recebe por isso.",
            highlight: "Guardar é deixar o dinheiro parado. Investir é fazer ele render.",
          },
          {
            title: "Dinheiro parado perde valor",
            body: "Os preços sobem com o tempo: isso é a **inflação**. Se a inflação do ano for 5%, R$ 1.000 parados compram, no fim do ano, o que R$ 950 compravam antes.\n\nInvestir é a forma de proteger e aumentar o seu **poder de compra**.",
          },
          {
            title: "Os dois grandes grupos",
            body: "- **Renda fixa:** você empresta dinheiro e as regras de rendimento são combinadas antes (Tesouro Direto, CDB, LCI, LCA).\n- **Renda variável:** o retorno depende do mercado (ações, fundos imobiliários, ETFs, criptomoedas). Pode render mais, mas oscila.",
          },
          {
            title: "Risco e retorno andam juntos",
            body: "Quanto maior o potencial de ganho, maior o risco. **Não existe investimento com retorno alto e risco zero.** Se alguém prometer isso, desconfie: é um sinal clássico de golpe.",
            highlight: "Regra de ouro: entenda onde está colocando seu dinheiro antes de investir.",
          },
        ],
        quiz: [
          {
            q: "Por que deixar o dinheiro parado na conta faz você perder poder de compra?",
            options: ["Porque o banco cobra uma taxa secreta", "Por causa da inflação, que aumenta os preços", "Porque o governo confisca parte do saldo", "Dinheiro parado não perde valor"],
            answer: 1,
            explain: "A inflação faz os preços subirem. Se o dinheiro não rende pelo menos a inflação, ele compra cada vez menos.",
          },
          {
            q: "Qual destes é um investimento de renda fixa?",
            options: ["Ações da Petrobras", "Bitcoin", "CDB", "Fundo imobiliário"],
            answer: 2,
            explain: "No CDB você empresta dinheiro ao banco com regras de rendimento definidas antes. Os demais são renda variável.",
          },
          {
            q: "Alguém promete 10% ao mês garantidos e sem risco. O que isso indica?",
            options: ["Uma ótima oportunidade", "Um investimento do governo", "Um forte sinal de golpe", "Um CDB comum"],
            answer: 2,
            explain: "Retornos altos e 'garantidos' não existem no mercado sério. Risco e retorno andam sempre juntos.",
          },
        ],
      },
      {
        id: "juros-compostos",
        title: "Juros compostos: o motor da riqueza",
        minutes: 5,
        cards: [
          {
            title: "Juros sobre juros",
            body: "Nos **juros compostos**, o rendimento de cada mês passa a render também. É como uma bola de neve: começa pequena e cresce cada vez mais rápido.",
          },
          {
            title: "Um exemplo real",
            body: "Investindo **R$ 300 por mês** a 10% ao ano:\n\n- Em 10 anos você aplica R$ 36 mil e tem cerca de **R$ 60 mil**.\n- Em 20 anos aplica R$ 72 mil e tem cerca de **R$ 215 mil**.\n- Em 30 anos aplica R$ 108 mil e chega a cerca de **R$ 620 mil**.",
            highlight: "Repare: depois de alguns anos, os juros passam a render mais do que os seus próprios aportes.",
          },
          {
            title: "O tempo é seu maior aliado",
            body: "Quem começa cedo precisa investir **muito menos** para chegar ao mesmo valor. Começar com pouco hoje vale mais do que começar com muito daqui a 10 anos.",
          },
          {
            title: "Regra dos 72",
            body: "Um atalho para saber em quanto tempo o dinheiro dobra: divida **72 pela taxa anual**. A 12% ao ano, o dinheiro dobra em cerca de 6 anos (72 ÷ 12).",
          },
        ],
        quiz: [
          {
            q: "O que caracteriza os juros compostos?",
            options: ["Os juros são calculados só sobre o valor inicial", "Os juros rendem sobre o valor inicial e sobre os juros anteriores", "Os juros são sempre fixos em reais", "Só existem na poupança"],
            answer: 1,
            explain: "Nos juros compostos o rendimento é reinvestido e passa a render também — juros sobre juros.",
          },
          {
            q: "Pela regra dos 72, a 8% ao ano o dinheiro dobra em aproximadamente:",
            options: ["4 anos", "9 anos", "15 anos", "72 anos"],
            answer: 1,
            explain: "72 ÷ 8 = 9 anos.",
          },
          {
            q: "Qual o fator mais poderoso a favor dos juros compostos?",
            options: ["Sorte", "Tempo", "Ter muito dinheiro no começo", "Trocar de investimento toda semana"],
            answer: 1,
            explain: "Quanto mais tempo o dinheiro fica investido, mais os juros sobre juros trabalham por você.",
          },
        ],
      },
      {
        id: "reserva-emergencia",
        title: "Reserva de emergência",
        minutes: 5,
        cards: [
          {
            title: "O primeiro investimento de todos",
            body: "A **reserva de emergência** é um dinheiro guardado para imprevistos: perda de emprego, conserto do carro, problema de saúde. Ela evita que você precise se endividar ou vender investimentos no pior momento.",
          },
          {
            title: "Quanto guardar?",
            body: "- **CLT / renda estável:** de 3 a 6 meses dos seus gastos mensais.\n- **Autônomo / renda variável:** de 6 a 12 meses.\n\nSe você gasta R$ 3.000 por mês, a reserva fica entre R$ 9 mil e R$ 18 mil.",
          },
          {
            title: "Onde deixar a reserva",
            body: "A reserva precisa de **segurança** e **liquidez** (poder sacar rápido, sem perder dinheiro):\n\n- Tesouro Selic\n- CDB com liquidez diária que pague pelo menos 100% do CDI\n- Contas e 'caixinhas' remuneradas de bancos sólidos\n\nNunca em ações, cripto ou investimentos com prazo travado.",
            highlight: "No Investa, crie uma meta 'Reserva de emergência' e acompanhe quanto falta.",
          },
        ],
        quiz: [
          {
            q: "Qual é a principal função da reserva de emergência?",
            options: ["Ficar rico rápido", "Cobrir imprevistos sem precisar se endividar", "Comprar ações em promoção", "Pagar a fatura do cartão todo mês"],
            answer: 1,
            explain: "A reserva protege você de imprevistos e evita dívidas caras ou vender investimentos na hora errada.",
          },
          {
            q: "Qual destas opções é mais adequada para a reserva?",
            options: ["Ações de uma empresa promissora", "Bitcoin", "Tesouro Selic", "CDB com vencimento em 5 anos sem liquidez"],
            answer: 2,
            explain: "O Tesouro Selic é seguro e permite resgatar a qualquer momento, sem perdas relevantes.",
          },
          {
            q: "Um autônomo que gasta R$ 4.000 por mês deveria ter uma reserva de aproximadamente:",
            options: ["R$ 4.000", "R$ 12.000", "R$ 24.000 a R$ 48.000", "Não precisa de reserva"],
            answer: 2,
            explain: "Para renda variável, o ideal é de 6 a 12 meses de gastos: R$ 24 mil a R$ 48 mil.",
          },
        ],
      },
    ],
  },
  {
    id: "organizacao",
    title: "Organização financeira",
    description: "Orçamento, dívidas e metas: a base para sobrar dinheiro para investir.",
    icon: "wallet",
    color: "#22C55E",
    level: "Iniciante",
    lessons: [
      {
        id: "orcamento",
        title: "Para onde vai o seu dinheiro?",
        minutes: 5,
        cards: [
          {
            title: "Você só controla o que mede",
            body: "Anotar os gastos por um mês costuma revelar surpresas: assinaturas esquecidas, delivery demais, tarifas bancárias. O primeiro passo é **saber exatamente para onde o dinheiro vai**.",
            highlight: "Use a aba Gastos do Investa para registrar compras, inclusive parceladas.",
          },
          {
            title: "A regra 50/30/20",
            body: "Uma divisão simples da renda líquida:\n\n- **50%** necessidades (moradia, contas, mercado, transporte)\n- **30%** desejos (lazer, restaurantes, compras)\n- **20%** futuro (investimentos e quitação de dívidas)",
          },
          {
            title: "Pague-se primeiro",
            body: "Assim que o salário cair, **separe o valor do investimento antes de gastar**. Deixar para investir 'o que sobrar' geralmente significa não investir nada.",
          },
          {
            title: "Cuidado com as parcelas",
            body: "Várias compras parceladas pequenas viram uma fatura grande. Antes de parcelar, veja quanto das próximas faturas **já está comprometido**.",
          },
        ],
        quiz: [
          {
            q: "Na regra 50/30/20, quanto vai para investimentos e dívidas?",
            options: ["50%", "30%", "20%", "Tudo o que sobrar"],
            answer: 2,
            explain: "20% da renda líquida vai para o futuro: investimentos e quitação de dívidas.",
          },
          {
            q: "O que significa 'pague-se primeiro'?",
            options: ["Comprar algo para você antes das contas", "Separar o investimento assim que o salário cai", "Pagar as dívidas só no fim do mês", "Sacar todo o salário"],
            answer: 1,
            explain: "Separar o valor do investimento logo no início garante que ele não seja gasto ao longo do mês.",
          },
          {
            q: "Por que acompanhar as parcelas futuras é importante?",
            options: ["Porque elas somem depois de um mês", "Porque comprometem a renda dos próximos meses", "Porque rendem juros para você", "Não é importante"],
            answer: 1,
            explain: "Parcelas já assumidas reduzem o quanto você terá disponível nos próximos meses.",
          },
        ],
      },
      {
        id: "dividas",
        title: "Saindo das dívidas",
        minutes: 6,
        cards: [
          {
            title: "Nem toda dívida é igual",
            body: "Os juros mudam tudo. **Cartão de crédito rotativo** e **cheque especial** estão entre as dívidas mais caras do Brasil. Já um consignado ou financiamento imobiliário costuma ter juros bem menores.",
          },
          {
            title: "Quitar dívida cara é o melhor investimento",
            body: "Se você paga 8% ao mês no cheque especial, quitar essa dívida 'rende' 8% ao mês — nenhum investimento seguro chega perto disso. **Primeiro elimine as dívidas caras, depois invista.**",
            highlight: "Por lei, o cheque especial pode cobrar no máximo 8% ao mês, e os juros e encargos do rotativo do cartão não podem passar de 100% do valor da dívida.",
          },
          {
            title: "Um plano para sair",
            body: "1. Liste todas as dívidas com valor, juros e parcela.\n2. Negocie: bancos costumam dar descontos para quitação.\n3. Troque dívida cara por barata (ex.: rotativo por empréstimo pessoal ou consignado).\n4. Ataque primeiro a de **maior juros**.",
          },
        ],
        quiz: [
          {
            q: "Qual dívida geralmente deve ser quitada primeiro?",
            options: ["Financiamento imobiliário", "A de maior taxa de juros", "A de menor valor sempre", "Nenhuma, é melhor investir"],
            answer: 1,
            explain: "Atacar a dívida de juros mais altos reduz mais rápido o custo total.",
          },
          {
            q: "Trocar o rotativo do cartão por um empréstimo pessoal com juros menores é:",
            options: ["Uma boa estratégia", "Sempre um erro", "Proibido", "Indiferente"],
            answer: 0,
            explain: "Trocar dívida cara por dívida mais barata reduz os juros pagos.",
          },
          {
            q: "Qual o limite de juros do cheque especial no Brasil?",
            options: ["2% ao mês", "8% ao mês", "20% ao mês", "Não há limite"],
            answer: 1,
            explain: "Desde 2020, o cheque especial é limitado a 8% ao mês para pessoas físicas.",
          },
        ],
      },
      {
        id: "metas",
        title: "Metas que funcionam",
        minutes: 4,
        cards: [
          {
            title: "Dinheiro com propósito",
            body: "Investir fica muito mais fácil quando cada real tem um objetivo: viagem, casa, aposentadoria. Metas claras ajudam a **manter a disciplina** nos meses difíceis.",
          },
          {
            title: "Curto, médio e longo prazo",
            body: "- **Curto (até 2 anos):** renda fixa com liquidez — Tesouro Selic, CDB.\n- **Médio (2 a 5 anos):** prefixados, IPCA+, CDBs mais longos.\n- **Longo (5+ anos):** dá para incluir ações, FIIs e exterior.",
          },
          {
            title: "Meta boa é específica",
            body: "Em vez de 'quero viajar', defina: **R$ 8.000 até dezembro do ano que vem**. Assim você descobre quanto precisa investir por mês e em quê.",
            highlight: "Na aba Objetivos, informe valor, prazo, banco e produto — o Investa calcula se você chega lá.",
          },
        ],
        quiz: [
          {
            q: "Para uma meta de 1 ano, qual investimento faz mais sentido?",
            options: ["Ações de empresas pequenas", "Criptomoedas", "Renda fixa com liquidez, como Tesouro Selic ou CDB", "Imóvel"],
            answer: 2,
            explain: "No curto prazo a prioridade é segurança: renda fixa com boa liquidez.",
          },
          {
            q: "Qual destas é uma meta bem definida?",
            options: ["Ficar rico", "Juntar R$ 10.000 até junho de 2028", "Guardar dinheiro", "Investir mais"],
            answer: 1,
            explain: "Ela tem valor e prazo claros, o que permite calcular o aporte mensal necessário.",
          },
          {
            q: "Por que ações combinam mais com metas de longo prazo?",
            options: ["Porque nunca caem", "Porque oscilam no curto prazo, mas tendem a crescer com o tempo", "Porque rendem juros fixos", "Porque têm liquidez zero"],
            answer: 1,
            explain: "Ações podem cair bastante no curto prazo; com mais tempo, há chance de recuperar e crescer.",
          },
        ],
      },
    ],
  },
  {
    id: "economia",
    title: "Economia do dia a dia",
    description: "Inflação, Selic, CDI e dólar: os números que mexem com o seu bolso.",
    icon: "landmark",
    color: "#F59E0B",
    level: "Iniciante",
    lessons: [
      {
        id: "inflacao",
        title: "Inflação e IPCA",
        minutes: 4,
        cards: [
          {
            title: "O que é inflação",
            body: "É o **aumento geral dos preços** ao longo do tempo. No Brasil, a inflação oficial é medida pelo **IPCA**, calculado todo mês pelo IBGE.",
          },
          {
            title: "Meta de inflação",
            body: "O Banco Central persegue uma **meta de inflação de 3% ao ano**, com tolerância de 1,5 ponto para cima ou para baixo. Quando a inflação foge da meta, o BC usa os juros (a Selic) para tentar trazê-la de volta.",
          },
          {
            title: "Rendimento real",
            body: "O que importa é quanto você ganha **acima da inflação**. Se seu investimento rendeu 10% e a inflação foi 5%, seu ganho real foi de cerca de 4,8%.",
            highlight: "No Investa, os indicadores oficiais do IPCA são atualizados direto do Banco Central.",
          },
        ],
        quiz: [
          {
            q: "Qual é o índice oficial de inflação do Brasil?",
            options: ["IGP-M", "IPCA", "CDI", "Ibovespa"],
            answer: 1,
            explain: "O IPCA, calculado pelo IBGE, é a medida oficial usada na meta de inflação.",
          },
          {
            q: "Seu investimento rendeu 8% e a inflação foi 8%. Seu ganho real foi:",
            options: ["8%", "16%", "Aproximadamente zero", "Negativo em 8%"],
            answer: 2,
            explain: "Se o rendimento só acompanha a inflação, o poder de compra fica praticamente igual.",
          },
          {
            q: "Qual ferramenta o Banco Central usa para combater a inflação alta?",
            options: ["Imprimir mais dinheiro", "Subir a taxa Selic", "Baixar os impostos", "Fechar a bolsa"],
            answer: 1,
            explain: "Juros mais altos encarecem o crédito, reduzem o consumo e ajudam a segurar os preços.",
          },
        ],
      },
      {
        id: "selic-cdi",
        title: "Selic, CDI e Copom",
        minutes: 5,
        cards: [
          {
            title: "Selic: a taxa básica de juros",
            body: "A **Selic** é a taxa básica de juros da economia. Ela influencia os juros de empréstimos, financiamentos e o rendimento da renda fixa.",
          },
          {
            title: "Quem decide: o Copom",
            body: "O **Copom** (Comitê de Política Monetária do Banco Central) se reúne **8 vezes por ano**, a cada cerca de 45 dias, e decide se a Selic sobe, cai ou fica igual.",
            highlight: "O Investa avisa você quando o Copom vai se reunir e qual foi a decisão.",
          },
          {
            title: "E o CDI?",
            body: "O **CDI** é a taxa que os bancos usam para emprestar dinheiro entre si. Ele anda colado na Selic (fica cerca de 0,10 ponto abaixo). Por isso, muitos investimentos rendem um **percentual do CDI**: um CDB de 110% do CDI rende 10% a mais que o próprio CDI.",
          },
          {
            title: "Como a Selic afeta você",
            body: "- **Selic subindo:** renda fixa rende mais; crédito fica mais caro; bolsa tende a sofrer.\n- **Selic caindo:** renda fixa rende menos; crédito fica mais barato; bolsa e FIIs tendem a se beneficiar.",
          },
        ],
        quiz: [
          {
            q: "Quem define a taxa Selic?",
            options: ["O presidente da República", "O Copom, do Banco Central", "A B3", "Os bancos privados"],
            answer: 1,
            explain: "O Comitê de Política Monetária do Banco Central decide a Selic em reuniões periódicas.",
          },
          {
            q: "Um CDB de 100% do CDI rende aproximadamente:",
            options: ["O mesmo que a poupança", "O mesmo que a Selic", "O dobro da inflação sempre", "Zero"],
            answer: 1,
            explain: "O CDI acompanha de perto a Selic, então 100% do CDI fica muito próximo da taxa básica.",
          },
          {
            q: "Quando a Selic cai, o que costuma acontecer?",
            options: ["Renda fixa rende mais", "Crédito fica mais caro", "Renda fixa rende menos e a bolsa tende a se beneficiar", "Nada muda"],
            answer: 2,
            explain: "Juros menores reduzem o rendimento da renda fixa e tornam a bolsa relativamente mais atrativa.",
          },
        ],
      },
      {
        id: "cambio",
        title: "Dólar e câmbio",
        minutes: 4,
        cards: [
          {
            title: "Por que o dólar importa",
            body: "Mesmo sem viajar, o dólar afeta seu bolso: combustível, eletrônicos, trigo e muitos produtos têm preço ligado a ele. Dólar alto costuma pressionar a **inflação**.",
          },
          {
            title: "Dólar comercial e PTAX",
            body: "O **dólar comercial** muda a cada segundo no mercado. A **PTAX** é uma taxa oficial calculada pelo Banco Central uma vez por dia e usada em contratos.",
          },
          {
            title: "Proteção com exterior",
            body: "Ter uma parte do patrimônio em ativos dolarizados (ETFs como IVVB11, BDRs ou ações americanas) ajuda a **proteger contra crises locais**, já que o dólar costuma subir quando o Brasil vai mal.",
          },
        ],
        quiz: [
          {
            q: "O que é a PTAX?",
            options: ["Um imposto sobre o dólar", "A taxa de câmbio oficial calculada pelo Banco Central", "Um tipo de criptomoeda", "Uma ação da B3"],
            answer: 1,
            explain: "A PTAX é calculada diariamente pelo BC e serve de referência para contratos.",
          },
          {
            q: "Dólar em alta tende a:",
            options: ["Baixar a inflação", "Pressionar a inflação para cima", "Não afetar preços no Brasil", "Baixar o preço da gasolina"],
            answer: 1,
            explain: "Produtos importados e cotados em dólar ficam mais caros, pressionando os preços.",
          },
          {
            q: "Por que investir uma parte no exterior pode proteger o patrimônio?",
            options: ["Porque o exterior nunca cai", "Porque o dólar costuma subir em crises no Brasil", "Porque não paga imposto", "Porque rende juros fixos"],
            answer: 1,
            explain: "Ativos dolarizados tendem a se valorizar em reais quando o Brasil passa por crises.",
          },
        ],
      },
    ],
  },
  {
    id: "renda-fixa",
    title: "Renda fixa na prática",
    description: "Tesouro Direto, CDB, LCI, LCA, FGC e impostos — sem mistério.",
    icon: "shield",
    color: "#06B6D4",
    level: "Iniciante",
    lessons: [
      {
        id: "tesouro-direto",
        title: "Tesouro Direto",
        minutes: 6,
        cards: [
          {
            title: "Emprestando para o governo",
            body: "No **Tesouro Direto** você compra títulos públicos, ou seja, empresta dinheiro ao governo federal. É considerado o investimento **mais seguro do país**. Dá para começar com cerca de R$ 30.",
          },
          {
            title: "Os principais títulos",
            body: "- **Tesouro Selic:** acompanha a Selic. Ideal para reserva de emergência.\n- **Tesouro Prefixado:** taxa definida na compra (ex.: 13% ao ano).\n- **Tesouro IPCA+:** paga a inflação + uma taxa fixa. Protege o poder de compra no longo prazo.\n- **Tesouro RendA+ e Educa+:** pensados para aposentadoria e para a educação dos filhos, pagam uma renda mensal no futuro.",
          },
          {
            title: "Marcação a mercado",
            body: "O preço dos títulos muda todos os dias. Se você vender **Prefixado ou IPCA+ antes do vencimento**, pode ganhar mais ou perder dinheiro. Levando até o vencimento, recebe exatamente a taxa combinada.",
            highlight: "O Tesouro Selic quase não sofre com isso — por isso é o preferido para a reserva.",
          },
          {
            title: "Custos",
            body: "Há uma **taxa de custódia da B3 de 0,20% ao ano** e o Imposto de Renda da tabela regressiva sobre o lucro. Muitas corretoras não cobram taxa própria.",
          },
        ],
        quiz: [
          {
            q: "Qual título é mais indicado para a reserva de emergência?",
            options: ["Tesouro IPCA+ 2045", "Tesouro Prefixado 2033", "Tesouro Selic", "Tesouro RendA+"],
            answer: 2,
            explain: "O Tesouro Selic tem baixíssima oscilação e pode ser resgatado a qualquer momento.",
          },
          {
            q: "O Tesouro IPCA+ paga:",
            options: ["Apenas a inflação", "Inflação mais uma taxa fixa", "Uma taxa fixa sem inflação", "O mesmo que a poupança"],
            answer: 1,
            explain: "Ele garante ganho real: IPCA + uma taxa definida na compra.",
          },
          {
            q: "O que pode acontecer ao vender um Tesouro Prefixado antes do vencimento?",
            options: ["Nada, sempre recebe a taxa combinada", "Pode ter ganho ou perda por causa da marcação a mercado", "É proibido vender antes", "Paga multa de 50%"],
            answer: 1,
            explain: "Antes do vencimento, o preço segue o mercado e pode estar acima ou abaixo do que você pagou.",
          },
        ],
      },
      {
        id: "cdb-lci-lca",
        title: "CDB, LCI e LCA",
        minutes: 6,
        cards: [
          {
            title: "Emprestando para bancos",
            body: "- **CDB:** você empresta ao banco e recebe juros, normalmente um % do CDI.\n- **LCI e LCA:** parecidas, mas o dinheiro financia o setor imobiliário (LCI) ou o agronegócio (LCA). A grande vantagem: são **isentas de IR** para pessoa física.",
          },
          {
            title: "A proteção do FGC",
            body: "O **Fundo Garantidor de Créditos** protege até **R$ 250 mil por CPF, por instituição** (com limite total de R$ 1 milhão a cada 4 anos). Se o banco quebrar, o FGC devolve o dinheiro.",
            highlight: "Por isso bancos menores podem pagar mais com a mesma garantia — respeitando o limite do FGC.",
          },
          {
            title: "Liquidez e prazo",
            body: "Alguns CDBs têm **liquidez diária** (resgate quando quiser); outros só pagam no vencimento e rendem mais. LCI e LCA têm um **prazo mínimo de carência** antes do resgate (em geral de 9 a 12 meses).",
          },
          {
            title: "Comparando de forma justa",
            body: "Como LCI e LCA não pagam IR, compare pelo rendimento **líquido**. Uma LCI de 90% do CDI pode render mais que um CDB de 105% do CDI em prazos menores que 2 anos.",
          },
        ],
        quiz: [
          {
            q: "Qual a principal vantagem da LCI e da LCA para pessoa física?",
            options: ["Rendem sempre o dobro do CDB", "São isentas de Imposto de Renda", "Não têm risco algum", "Podem ser sacadas no mesmo dia sempre"],
            answer: 1,
            explain: "LCI e LCA são isentas de IR para pessoas físicas.",
          },
          {
            q: "Qual o limite de garantia do FGC por CPF e por instituição?",
            options: ["R$ 50 mil", "R$ 100 mil", "R$ 250 mil", "Ilimitado"],
            answer: 2,
            explain: "O FGC garante até R$ 250 mil por CPF em cada instituição financeira.",
          },
          {
            q: "Um CDB com liquidez diária permite:",
            options: ["Resgatar a qualquer dia útil", "Resgatar só no vencimento", "Resgatar uma vez por ano", "Nunca resgatar"],
            answer: 0,
            explain: "Liquidez diária significa que você pode resgatar quando precisar.",
          },
        ],
      },
      {
        id: "impostos-renda-fixa",
        title: "Impostos e poupança",
        minutes: 5,
        cards: [
          {
            title: "Tabela regressiva do IR",
            body: "Na renda fixa (CDB, Tesouro, debêntures comuns), o IR incide **só sobre o lucro** e cai com o tempo:\n\n- Até 180 dias: **22,5%**\n- 181 a 360 dias: **20%**\n- 361 a 720 dias: **17,5%**\n- Acima de 720 dias: **15%**",
          },
          {
            title: "IOF nos primeiros 30 dias",
            body: "Se resgatar em menos de 30 dias, há também **IOF** sobre o rendimento, que começa em 96% no primeiro dia e chega a zero no 30º dia.",
          },
          {
            title: "E a poupança?",
            body: "Quando a Selic está acima de 8,5% ao ano, a poupança rende **0,5% ao mês + TR**. É isenta de IR, mas costuma render bem menos que um CDB de 100% do CDI ou o Tesouro Selic, mesmo depois do imposto.",
            highlight: "Na aba Mercado → Renda Fixa, o Investa compara poupança, CDB, LCI e LCA com o CDI do dia.",
          },
        ],
        quiz: [
          {
            q: "Qual a alíquota de IR para um CDB resgatado após 3 anos?",
            options: ["22,5%", "20%", "17,5%", "15%"],
            answer: 3,
            explain: "Acima de 720 dias a alíquota é de 15%.",
          },
          {
            q: "Sobre qual valor o IR da renda fixa é cobrado?",
            options: ["Sobre todo o valor investido", "Apenas sobre o lucro", "Sobre o salário", "Não é cobrado"],
            answer: 1,
            explain: "O imposto incide somente sobre o rendimento obtido.",
          },
          {
            q: "Com a Selic acima de 8,5%, a poupança rende:",
            options: ["100% do CDI", "0,5% ao mês + TR", "Inflação + 6%", "10% ao ano fixo"],
            answer: 1,
            explain: "Essa é a regra da poupança quando a Selic está acima de 8,5% ao ano.",
          },
        ],
      },
    ],
  },
  {
    id: "acoes",
    title: "Bolsa de valores e ações",
    description: "Como funciona a B3, tipos de ações, sua primeira compra e dividendos.",
    icon: "candlestick",
    color: "#8B5CF6",
    level: "Intermediário",
    lessons: [
      {
        id: "o-que-sao-acoes",
        title: "O que são ações?",
        minutes: 5,
        cards: [
          {
            title: "Virando sócio de empresas",
            body: "Uma **ação** é um pedacinho de uma empresa. Comprando ações da Petrobras ou do Itaú, você vira sócio e participa dos lucros — e também dos riscos.",
          },
          {
            title: "A B3 e o Ibovespa",
            body: "A **B3** é a bolsa de valores do Brasil, onde as ações são negociadas. O **Ibovespa** é o principal índice: mostra o desempenho médio das ações mais negociadas. Quando dizem 'a bolsa subiu', geralmente é o Ibovespa.",
          },
          {
            title: "Entendendo os códigos",
            body: "- Final **3**: ação ordinária (ON), dá direito a voto. Ex.: VALE3.\n- Final **4**: ação preferencial (PN), prioridade nos dividendos. Ex.: PETR4.\n- Final **11**: units (pacotes de ações), FIIs e ETFs. Ex.: TAEE11.",
          },
          {
            title: "Lote padrão e fracionário",
            body: "No mercado padrão, as ações são negociadas em lotes de 100. No **mercado fracionário** (código com F, ex.: PETR4F) você compra de 1 em 1 — ótimo para começar com pouco.",
          },
        ],
        quiz: [
          {
            q: "O que significa o final 3 em um código como VALE3?",
            options: ["Ação preferencial", "Ação ordinária, com direito a voto", "Fundo imobiliário", "Terceira emissão"],
            answer: 1,
            explain: "Ações ordinárias (ON) terminam em 3 e dão direito a voto nas assembleias.",
          },
          {
            q: "O que é o Ibovespa?",
            options: ["Uma corretora", "O principal índice de ações da B3", "Um título do Tesouro", "Uma criptomoeda brasileira"],
            answer: 1,
            explain: "É o índice que mede o desempenho médio das ações mais negociadas.",
          },
          {
            q: "Como comprar só 5 ações de PETR4?",
            options: ["Não é possível", "Usando o mercado fracionário (PETR4F)", "Pedindo ao Banco Central", "Comprando um FII"],
            answer: 1,
            explain: "No mercado fracionário é possível comprar de 1 a 99 ações.",
          },
        ],
      },
      {
        id: "primeira-compra",
        title: "Sua primeira compra",
        minutes: 6,
        cards: [
          {
            title: "1. Abra conta em uma corretora",
            body: "É pela **corretora** (ou banco com plataforma de investimentos) que você acessa a bolsa. Muitas não cobram taxa para negociar ações e FIIs. Verifique se ela é autorizada pela CVM e pelo Banco Central.",
          },
          {
            title: "2. Transfira o dinheiro e use o home broker",
            body: "O **home broker** é a tela de negociação. O pregão regular acontece em dias úteis, das **10h às 17h** (aproximadamente).",
          },
          {
            title: "3. Escolha o tipo de ordem",
            body: "- **Ordem a mercado:** compra pelo melhor preço disponível na hora.\n- **Ordem limitada:** você define o preço máximo que aceita pagar. Mais controle, ideal para iniciantes.",
          },
          {
            title: "4. Liquidação e custos",
            body: "A compra é liquidada em **D+2** (dois dias úteis depois). Há pequenos **emolumentos da B3** e, se houver lucro na venda, Imposto de Renda.",
            highlight: "Antes de usar dinheiro de verdade, treine no Simulador do Investa com R$ 100 mil virtuais e preços reais.",
          },
        ],
        quiz: [
          {
            q: "O que é o home broker?",
            options: ["Um corretor de imóveis", "A plataforma onde você compra e vende ativos na bolsa", "Um tipo de ação", "Um imposto"],
            answer: 1,
            explain: "É o sistema da corretora que envia suas ordens de compra e venda para a B3.",
          },
          {
            q: "Na ordem limitada, você:",
            options: ["Compra a qualquer preço", "Define o preço máximo (ou mínimo, na venda)", "Compra só na sexta-feira", "Não paga emolumentos"],
            answer: 1,
            explain: "A ordem limitada só é executada no preço definido ou melhor.",
          },
          {
            q: "Em quanto tempo uma compra de ações é liquidada?",
            options: ["Na hora", "D+2 (dois dias úteis)", "30 dias", "Um ano"],
            answer: 1,
            explain: "As operações à vista na B3 são liquidadas em D+2.",
          },
        ],
      },
      {
        id: "dividendos",
        title: "Dividendos e JCP",
        minutes: 5,
        cards: [
          {
            title: "Parte do lucro no seu bolso",
            body: "**Dividendos** são a parte do lucro que a empresa distribui aos acionistas. Para a grande maioria dos investidores pessoa física, eles são **isentos de IR**.",
            highlight: "Desde 2026, valores acima de R$ 50 mil por mês recebidos de uma mesma empresa têm retenção de 10% de IR — o que não afeta a maioria dos pequenos investidores.",
          },
          {
            title: "Juros sobre Capital Próprio (JCP)",
            body: "O **JCP** é outra forma de distribuir lucros. A diferença é que ele tem **15% de IR retido na fonte** — você já recebe o valor líquido.",
          },
          {
            title: "Data com e data ex",
            body: "Para ter direito ao provento, você precisa ter a ação no fim do pregão da **data com**. No dia seguinte (**data ex**), quem comprar não recebe aquele pagamento — e o preço costuma cair no valor do provento.",
          },
          {
            title: "Dividend yield (DY)",
            body: "O **DY** mostra quanto a empresa pagou em proventos nos últimos 12 meses em relação ao preço. DY de 8% = R$ 8 por ano para cada R$ 100 investidos. Cuidado: DY altíssimo pode ser sinal de que o preço despencou.",
          },
        ],
        quiz: [
          {
            q: "Qual a diferença principal entre dividendos e JCP para a pessoa física?",
            options: ["Não há diferença", "O JCP tem 15% de IR retido na fonte", "Dividendos pagam 30% de IR", "JCP é pago só em dólar"],
            answer: 1,
            explain: "O JCP tem IR de 15% retido na fonte; dividendos, em regra, são isentos para a maioria dos investidores.",
          },
          {
            q: "Para receber um dividendo, você precisa ter a ação até:",
            options: ["A data ex", "A data com", "A data de pagamento", "O fim do ano"],
            answer: 1,
            explain: "Quem tem a ação no fechamento da data com tem direito ao provento.",
          },
          {
            q: "Um DY muito acima da média pode indicar:",
            options: ["Que é garantido continuar assim", "Que o preço caiu muito, talvez por problemas", "Que a empresa é estatal", "Nada, DY alto é sempre bom"],
            answer: 1,
            explain: "Como o DY é proventos ÷ preço, uma queda forte de preço infla o indicador.",
          },
        ],
      },
    ],
  },
  {
    id: "analise",
    title: "Analisando empresas",
    description: "P/L, P/VP, ROE, dívida e um checklist para escolher boas empresas.",
    icon: "search",
    color: "#EC4899",
    level: "Intermediário",
    lessons: [
      {
        id: "indicadores-preco",
        title: "Indicadores de preço: P/L e P/VP",
        minutes: 6,
        cards: [
          {
            title: "P/L — preço sobre lucro",
            body: "O **P/L** indica quantos anos de lucro seriam necessários para 'pagar' o preço da ação. P/L 10 = 10 anos. P/L baixo **pode** indicar ação barata — ou uma empresa com problemas.",
          },
          {
            title: "P/VP — preço sobre valor patrimonial",
            body: "Compara o preço com o patrimônio da empresa. **P/VP abaixo de 1** significa que a bolsa avalia a empresa por menos do que ela tem de patrimônio no balanço.",
          },
          {
            title: "Compare dentro do setor",
            body: "Bancos costumam ter P/L entre 5 e 12; empresas de tecnologia e crescimento podem passar de 30. **Compare sempre empresas do mesmo setor** e o histórico da própria empresa.",
            highlight: "Na tela de cada ativo do Mercado, o Investa mostra P/L, P/VP e DY com dados reais.",
          },
        ],
        quiz: [
          {
            q: "Uma ação com P/L 8 significa que:",
            options: ["Ela custa R$ 8", "Mantido o lucro atual, seriam 8 anos para o lucro igualar o preço", "Ela vai subir 8%", "Ela paga 8% de dividendos"],
            answer: 1,
            explain: "O P/L relaciona o preço com o lucro por ação.",
          },
          {
            q: "P/VP abaixo de 1 indica que:",
            options: ["A empresa vai falir", "O mercado avalia a empresa por menos que seu patrimônio contábil", "A ação é proibida", "Ela não paga dividendos"],
            answer: 1,
            explain: "O preço está abaixo do valor patrimonial por ação.",
          },
          {
            q: "Qual a forma correta de usar o P/L?",
            options: ["Comparar empresas de setores totalmente diferentes", "Comparar com empresas do mesmo setor e com o histórico", "Comprar sempre a de menor P/L", "Ignorar o lucro"],
            answer: 1,
            explain: "Cada setor tem características próprias; a comparação justa é entre pares.",
          },
        ],
      },
      {
        id: "indicadores-qualidade",
        title: "Qualidade: ROE, margens e dívida",
        minutes: 6,
        cards: [
          {
            title: "ROE — retorno sobre o patrimônio",
            body: "Mostra a **eficiência** da empresa em gerar lucro com o dinheiro dos sócios. ROE de 20% = R$ 20 de lucro por ano para cada R$ 100 de patrimônio. Quanto maior e mais constante, melhor.",
          },
          {
            title: "Margens",
            body: "A **margem líquida** mostra quanto de cada R$ 100 vendidos vira lucro. Margens estáveis ou crescentes indicam uma empresa com **vantagem competitiva**.",
          },
          {
            title: "Dívida líquida / EBITDA",
            body: "Indica em quantos anos a empresa pagaria sua dívida com a geração de caixa. Em geral, **até 2 ou 3 vezes** é confortável; muito acima disso aumenta o risco, especialmente com juros altos.",
          },
        ],
        quiz: [
          {
            q: "O ROE mede:",
            options: ["O preço da ação", "A eficiência em gerar lucro com o patrimônio dos sócios", "A dívida da empresa", "O número de funcionários"],
            answer: 1,
            explain: "ROE = lucro líquido ÷ patrimônio líquido.",
          },
          {
            q: "Uma dívida líquida/EBITDA de 6x geralmente indica:",
            options: ["Empresa sem dívidas", "Endividamento alto e mais risco", "Lucro garantido", "Ação barata"],
            answer: 1,
            explain: "Seriam necessários cerca de 6 anos de geração de caixa para quitar a dívida.",
          },
          {
            q: "Margens estáveis ou crescentes ao longo dos anos sugerem:",
            options: ["Vantagem competitiva", "Prejuízo", "Fraude", "Que a empresa vai sair da bolsa"],
            answer: 0,
            explain: "Manter margens boas por anos é sinal de um negócio sólido.",
          },
        ],
      },
      {
        id: "checklist",
        title: "Checklist para escolher empresas",
        minutes: 5,
        cards: [
          {
            title: "Fundamentalista x técnica",
            body: "- **Análise fundamentalista:** estuda o negócio, os lucros e a saúde financeira. Foco no longo prazo.\n- **Análise técnica:** estuda gráficos e padrões de preço. Mais usada para operações curtas.\n\nPara quem está começando e pensa no longo prazo, a fundamentalista é o melhor caminho.",
          },
          {
            title: "Um checklist simples",
            body: "1. Entendo como a empresa ganha dinheiro?\n2. Ela dá lucro de forma consistente há anos?\n3. O ROE é bom para o setor?\n4. A dívida está sob controle?\n5. O preço (P/L, P/VP) é razoável comparado aos pares?\n6. A gestão é confiável?",
          },
          {
            title: "Diversifique entre setores",
            body: "Mesmo empresas excelentes passam por fases ruins. Ter ações de **setores diferentes** (bancos, energia, consumo, saneamento) reduz o impacto de um problema específico.",
          },
        ],
        quiz: [
          {
            q: "Qual análise é mais indicada para investir pensando no longo prazo?",
            options: ["Análise técnica", "Análise fundamentalista", "Horóscopo", "Seguir dicas de redes sociais"],
            answer: 1,
            explain: "A fundamentalista avalia o negócio e seus resultados, o que importa no longo prazo.",
          },
          {
            q: "Qual pergunta faz parte de um bom checklist?",
            options: ["A ação subiu ontem?", "A empresa dá lucro de forma consistente?", "Meu amigo comprou?", "O código da ação é bonito?"],
            answer: 1,
            explain: "Lucros consistentes são um dos pilares de uma boa empresa para investir.",
          },
          {
            q: "Por que diversificar entre setores?",
            options: ["Para pagar menos impostos", "Para reduzir o impacto de problemas de um setor específico", "Porque é obrigatório", "Para ganhar mais dividendos sempre"],
            answer: 1,
            explain: "Setores diferentes reagem de forma diferente aos acontecimentos da economia.",
          },
        ],
      },
    ],
  },
  {
    id: "fiis",
    title: "Fundos imobiliários",
    description: "Renda mensal com imóveis: tipos de FIIs, como analisar e montar renda passiva.",
    icon: "building",
    color: "#14B8A6",
    level: "Intermediário",
    lessons: [
      {
        id: "o-que-sao-fiis",
        title: "O que são FIIs?",
        minutes: 5,
        cards: [
          {
            title: "Imóveis com pouco dinheiro",
            body: "Um **Fundo de Investimento Imobiliário (FII)** junta o dinheiro de muitos investidores para comprar imóveis ou títulos do setor. Você compra **cotas** na bolsa (códigos terminados em 11) e recebe **rendimentos, geralmente todo mês**.",
          },
          {
            title: "Tipos de FIIs",
            body: "- **Tijolo:** imóveis físicos — galpões logísticos, shoppings, lajes corporativas.\n- **Papel:** títulos de crédito imobiliário (CRI). Renda ligada a juros e inflação.\n- **Fundos de fundos (FoF):** compram cotas de outros FIIs.\n- **Híbridos:** misturam estratégias.",
          },
          {
            title: "Vantagens tributárias",
            body: "Os rendimentos mensais são **isentos de IR** para pessoa física, desde que o fundo cumpra regras como ter pelo menos 100 cotistas e negociar em bolsa. Já o **lucro na venda das cotas paga 20%**.",
          },
        ],
        quiz: [
          {
            q: "Um FII de tijolo investe principalmente em:",
            options: ["Títulos do Tesouro", "Imóveis físicos, como galpões e shoppings", "Ações de bancos", "Criptomoedas"],
            answer: 1,
            explain: "Fundos de tijolo possuem imóveis e recebem aluguéis.",
          },
          {
            q: "Os rendimentos mensais de FIIs para pessoa física, seguindo as regras, são:",
            options: ["Tributados em 15%", "Isentos de IR", "Tributados em 27,5%", "Proibidos"],
            answer: 1,
            explain: "Os rendimentos distribuídos são isentos para pessoa física dentro das regras.",
          },
          {
            q: "Qual o IR sobre o lucro na venda de cotas de FIIs?",
            options: ["Isento até R$ 20 mil", "15%", "20%", "22,5%"],
            answer: 2,
            explain: "O ganho de capital na venda de cotas de FIIs é tributado em 20%, sem isenção.",
          },
        ],
      },
      {
        id: "analisando-fiis",
        title: "Como analisar FIIs",
        minutes: 6,
        cards: [
          {
            title: "Dividend yield e P/VP",
            body: "O **DY** mostra a renda dos últimos 12 meses em relação ao preço. O **P/VP** compara o preço da cota com o valor patrimonial: perto de 1 indica preço justo; muito acima de 1, o mercado está pagando caro.",
          },
          {
            title: "Vacância",
            body: "É a parte dos imóveis **sem inquilino**. Vacância alta reduz a renda do fundo. Prefira fundos com imóveis bem localizados e vacância baixa.",
          },
          {
            title: "Qualidade e diversificação",
            body: "Avalie: quantos imóveis e inquilinos o fundo tem, prazo dos contratos, qualidade da gestora e **liquidez** (volume negociado por dia). Fundos com um único imóvel são mais arriscados.",
            highlight: "Leia o relatório gerencial mensal do fundo — ele mostra vacância, inquilinos e próximos passos.",
          },
        ],
        quiz: [
          {
            q: "Vacância alta em um FII significa:",
            options: ["Muitos imóveis alugados", "Muitos imóveis sem inquilino, o que reduz a renda", "Que o fundo é de papel", "Que o DY vai dobrar"],
            answer: 1,
            explain: "Imóveis vazios não geram aluguel, e o fundo ainda arca com os custos.",
          },
          {
            q: "Um FII com P/VP de 1,4 indica que:",
            options: ["O preço está 40% acima do valor patrimonial", "O preço está 40% abaixo", "O fundo vai fechar", "O DY é de 1,4%"],
            answer: 0,
            explain: "P/VP acima de 1 significa que o mercado paga mais que o valor patrimonial da cota.",
          },
          {
            q: "Por que fundos com muitos imóveis e inquilinos tendem a ser menos arriscados?",
            options: ["Pagam menos impostos", "A saída de um inquilino afeta menos a renda total", "Não oscilam na bolsa", "São garantidos pelo FGC"],
            answer: 1,
            explain: "Diversificação reduz a dependência de um único imóvel ou inquilino.",
          },
        ],
      },
      {
        id: "renda-passiva",
        title: "Construindo renda passiva",
        minutes: 5,
        cards: [
          {
            title: "Efeito bola de neve",
            body: "Reinvestindo os rendimentos todo mês, você compra mais cotas, que geram mais rendimentos, que compram mais cotas... É o **juro composto** aplicado aos FIIs.",
          },
          {
            title: "O 'número mágico'",
            body: "É a quantidade de cotas em que o rendimento mensal já **compra uma cota nova sozinho**. Ex.: cota de R$ 10 que paga R$ 0,10 por mês → com 100 cotas, o rendimento compra 1 cota nova todo mês.",
          },
          {
            title: "Renda para viver",
            body: "Para receber R$ 2.000 por mês com FIIs que rendem cerca de 0,8% ao mês, você precisaria de aproximadamente **R$ 250 mil investidos**. É um objetivo de longo prazo — e cada aporte aproxima você dele.",
          },
        ],
        quiz: [
          {
            q: "O que é o 'número mágico' de um FII?",
            options: ["O código do fundo", "A quantidade de cotas cujo rendimento compra uma nova cota", "O número de imóveis", "A taxa de administração"],
            answer: 1,
            explain: "É quando o rendimento mensal se torna suficiente para comprar uma cota inteira.",
          },
          {
            q: "Reinvestir os rendimentos dos FIIs:",
            options: ["Acelera o crescimento pelo efeito dos juros compostos", "Não faz diferença", "É proibido", "Aumenta o imposto"],
            answer: 0,
            explain: "Mais cotas geram mais rendimentos, criando o efeito bola de neve.",
          },
          {
            q: "Com rendimento de ~0,8% ao mês, quanto é preciso para receber cerca de R$ 1.000 mensais?",
            options: ["R$ 12.500", "R$ 125.000", "R$ 1.250.000", "R$ 8.000"],
            answer: 1,
            explain: "R$ 1.000 ÷ 0,008 = R$ 125.000.",
          },
        ],
      },
    ],
  },
  {
    id: "exterior-cripto",
    title: "ETFs, exterior e cripto",
    description: "Diversificação com ETFs, BDRs, ações americanas e criptomoedas — com os riscos claros.",
    icon: "globe",
    color: "#0EA5E9",
    level: "Intermediário",
    lessons: [
      {
        id: "etfs",
        title: "ETFs: diversificar em um clique",
        minutes: 5,
        cards: [
          {
            title: "Uma cesta de ativos",
            body: "Um **ETF** é um fundo negociado na bolsa que replica um índice. Com o **BOVA11** você investe nas principais ações do Ibovespa de uma vez; com o **IVVB11**, nas 500 maiores empresas dos EUA.",
          },
          {
            title: "Por que é bom para começar",
            body: "- Diversificação imediata\n- Taxas de administração baixas\n- Compra e venda como uma ação comum\n- Não exige escolher empresas uma a uma",
          },
          {
            title: "Impostos",
            body: "Em ETFs de renda variável, o lucro na venda paga **15% de IR**, e **não existe** a isenção de R$ 20 mil mensais que vale para ações.",
          },
        ],
        quiz: [
          {
            q: "O que o IVVB11 replica?",
            options: ["O Ibovespa", "O índice S&P 500, dos EUA", "O preço do ouro", "O CDI"],
            answer: 1,
            explain: "O IVVB11 segue o S&P 500, as 500 maiores empresas americanas.",
          },
          {
            q: "Qual é uma vantagem dos ETFs?",
            options: ["Garantia do FGC", "Diversificação imediata com taxas baixas", "Rendimento fixo", "Não oscilam"],
            answer: 1,
            explain: "Em uma única compra você tem exposição a dezenas ou centenas de ativos.",
          },
          {
            q: "A isenção de IR para vendas até R$ 20 mil por mês vale para ETFs?",
            options: ["Sim", "Não, ETFs pagam 15% sobre o lucro na venda", "Só para ETFs de cripto", "Só no fim do ano"],
            answer: 1,
            explain: "A isenção de R$ 20 mil é exclusiva para ações no mercado à vista.",
          },
        ],
      },
      {
        id: "bdrs-exterior",
        title: "BDRs e investimento no exterior",
        minutes: 5,
        cards: [
          {
            title: "BDRs",
            body: "**BDRs** são certificados negociados na B3 que representam ações estrangeiras, como Apple (AAPL34) e Nvidia (NVDC34). Você investe lá fora **sem sair da corretora brasileira**.",
          },
          {
            title: "Efeito do dólar",
            body: "O BDR acompanha a ação lá fora **e o dólar**. Se a ação sobe 5% e o dólar sobe 3%, o BDR sobe cerca de 8% em reais. Se o dólar cai, o efeito é o contrário.",
          },
          {
            title: "Quanto ter no exterior?",
            body: "Não existe número mágico, mas muitos investidores mantêm **de 10% a 30%** do patrimônio exposto a outros países para diversificar e se proteger de crises locais.",
          },
        ],
        quiz: [
          {
            q: "O que é um BDR?",
            options: ["Um título do Tesouro", "Um certificado na B3 que representa ações estrangeiras", "Uma criptomoeda", "Um tipo de CDB"],
            answer: 1,
            explain: "BDRs permitem investir em empresas estrangeiras pela bolsa brasileira.",
          },
          {
            q: "Se a ação lá fora sobe e o dólar também sobe, o BDR em reais tende a:",
            options: ["Cair", "Subir ainda mais", "Ficar igual", "Ser cancelado"],
            answer: 1,
            explain: "O BDR soma a variação da ação e a variação do dólar.",
          },
          {
            q: "Qual o principal motivo para ter parte do patrimônio no exterior?",
            options: ["Pagar menos imposto", "Diversificar e se proteger de crises locais", "Garantia de lucro", "Evitar a B3"],
            answer: 1,
            explain: "Investir em outras economias e moedas reduz a dependência do Brasil.",
          },
        ],
      },
      {
        id: "cripto",
        title: "Criptomoedas: oportunidades e riscos",
        minutes: 6,
        cards: [
          {
            title: "O que são",
            body: "**Criptomoedas** como Bitcoin e Ethereum são ativos digitais que funcionam em redes descentralizadas (blockchain). Não têm lastro de governo e seu preço depende de oferta e demanda.",
          },
          {
            title: "Volatilidade extrema",
            body: "Quedas de **50% ou mais** já aconteceram várias vezes. Por isso, se fizer sentido para você, mantenha cripto como uma **parte pequena** da carteira (muitos usam de 1% a 5%) e só depois da reserva de emergência.",
          },
          {
            title: "Como investir com mais segurança",
            body: "- Exchanges conhecidas e autorizadas a operar no Brasil\n- ETFs de cripto na B3 (ex.: HASH11, QBTC11)\n- Nunca compartilhe senhas, frases de recuperação ou códigos",
          },
          {
            title: "Impostos e golpes",
            body: "Vendas de até **R$ 35 mil por mês** são isentas de IR; acima disso, paga-se a partir de 15% sobre o lucro. E atenção: muitos golpes usam cripto como isca, prometendo lucros garantidos.",
          },
        ],
        quiz: [
          {
            q: "Qual uma característica marcante das criptomoedas?",
            options: ["Rendimento fixo garantido", "Alta volatilidade", "Garantia do FGC", "Controle do Banco Central sobre o preço"],
            answer: 1,
            explain: "Os preços variam muito, com quedas fortes em pouco tempo.",
          },
          {
            q: "Qual o limite mensal de vendas de cripto isento de IR?",
            options: ["R$ 20 mil", "R$ 35 mil", "R$ 100 mil", "Não há isenção"],
            answer: 1,
            explain: "Vendas de até R$ 35 mil por mês são isentas.",
          },
          {
            q: "Qual atitude é mais segura?",
            options: ["Compartilhar a frase de recuperação com o suporte", "Colocar toda a reserva em Bitcoin", "Usar uma parte pequena da carteira e plataformas confiáveis", "Seguir quem promete lucro garantido"],
            answer: 2,
            explain: "Exposição pequena e plataformas confiáveis reduzem o risco.",
          },
        ],
      },
    ],
  },
  {
    id: "carteira",
    title: "Montando sua carteira",
    description: "Perfil, alocação de ativos, rebalanceamento e aportes inteligentes.",
    icon: "pie",
    color: "#A78BFA",
    level: "Avançado",
    lessons: [
      {
        id: "perfil-alocacao",
        title: "Perfil e alocação de ativos",
        minutes: 6,
        cards: [
          {
            title: "Qual o seu perfil?",
            body: "- **Conservador:** prioriza segurança; aceita ganhar menos para oscilar pouco.\n- **Moderado:** aceita alguma oscilação em busca de mais retorno.\n- **Arrojado:** tolera quedas fortes pensando no longo prazo.",
          },
          {
            title: "Alocação de ativos",
            body: "É a divisão do dinheiro entre classes (renda fixa, ações, FIIs, exterior). Estudos mostram que a **alocação explica a maior parte do resultado** de uma carteira no longo prazo — mais do que escolher a 'ação certa'.",
          },
          {
            title: "Exemplos de ponto de partida",
            body: "| Perfil | Renda fixa | Ações | FIIs | Exterior |\n|---|---|---|---|---|\n| Conservador | 80% | 5% | 10% | 5% |\n| Moderado | 55% | 20% | 15% | 10% |\n| Arrojado | 30% | 35% | 15% | 20% |",
            highlight: "São apenas exemplos. Seu prazo e objetivos importam mais que um modelo pronto.",
          },
        ],
        quiz: [
          {
            q: "O que mais influencia o resultado de longo prazo de uma carteira?",
            options: ["Acertar a ação do momento", "A alocação entre classes de ativos", "Operar todo dia", "A cor do aplicativo"],
            answer: 1,
            explain: "A divisão entre classes de ativos é o principal fator no longo prazo.",
          },
          {
            q: "Um investidor conservador tende a ter:",
            options: ["A maior parte em ações", "A maior parte em renda fixa", "Tudo em cripto", "Nenhum investimento"],
            answer: 1,
            explain: "O conservador prioriza segurança e baixa oscilação.",
          },
          {
            q: "Seu perfil de investidor pode mudar?",
            options: ["Nunca", "Sim, com a experiência, a renda e os objetivos", "Só aos 60 anos", "Só se o banco quiser"],
            answer: 1,
            explain: "O perfil acompanha sua vida: experiência, objetivos e situação financeira.",
          },
        ],
      },
      {
        id: "rebalanceamento",
        title: "Diversificação e rebalanceamento",
        minutes: 5,
        cards: [
          {
            title: "Não coloque todos os ovos na mesma cesta",
            body: "Diversificar entre classes, setores e países faz com que um problema isolado **não derrube toda a carteira**.",
          },
          {
            title: "Rebalancear",
            body: "Com o tempo, o que subiu passa a pesar mais. **Rebalancear** é voltar à divisão planejada — vendendo um pouco do que subiu ou, melhor ainda, direcionando os novos aportes para o que ficou abaixo do alvo.",
          },
          {
            title: "Com que frequência?",
            body: "Para a maioria das pessoas, **1 ou 2 vezes por ano** é suficiente. Rebalancear com aportes novos evita custos e impostos de venda.",
          },
        ],
        quiz: [
          {
            q: "O que é rebalancear a carteira?",
            options: ["Vender tudo", "Voltar à divisão planejada entre os ativos", "Comprar só o que mais subiu", "Trocar de corretora"],
            answer: 1,
            explain: "Rebalancear corrige os desvios em relação à alocação alvo.",
          },
          {
            q: "A forma mais eficiente de rebalancear costuma ser:",
            options: ["Vender tudo todo mês", "Direcionar novos aportes para o que está abaixo do alvo", "Nunca investir mais", "Pedir empréstimo"],
            answer: 1,
            explain: "Usar aportes evita custos e impostos de venda.",
          },
          {
            q: "Diversificar serve para:",
            options: ["Garantir lucro", "Reduzir o impacto de um problema isolado", "Pagar menos taxa", "Eliminar todo o risco"],
            answer: 1,
            explain: "Diversificação reduz riscos específicos, mas não elimina todo risco.",
          },
        ],
      },
      {
        id: "aportes",
        title: "Aportes mensais e preço médio",
        minutes: 5,
        cards: [
          {
            title: "Constância vence o 'timing'",
            body: "Tentar adivinhar o melhor dia para comprar raramente funciona. Investir **todo mês um valor fixo** cria disciplina e aproveita os juros compostos.",
          },
          {
            title: "Preço médio",
            body: "Comprando aos poucos, você paga às vezes mais caro e às vezes mais barato, formando um **preço médio**. Em quedas, o mesmo valor compra mais cotas.",
          },
          {
            title: "Automatize",
            body: "Agende transferências ou investimentos automáticos para o dia do salário. O que é automático **não depende de força de vontade**.",
            highlight: "Configure alertas no Investa para ser avisado quando um ativo da sua carteira estiver abaixo da média — pode ser uma boa hora para aportar.",
          },
        ],
        quiz: [
          {
            q: "O que costuma funcionar melhor no longo prazo?",
            options: ["Tentar acertar o dia exato da compra", "Investir com constância todo mês", "Investir só quando todos estão comprando", "Esperar o 'momento perfeito' por anos"],
            answer: 1,
            explain: "A constância aproveita os juros compostos e reduz o risco de entrar tudo em um momento ruim.",
          },
          {
            q: "Quando o preço cai e você mantém o mesmo aporte mensal:",
            options: ["Compra menos cotas", "Compra mais cotas", "Não pode comprar", "Perde o dinheiro"],
            answer: 1,
            explain: "Com preço menor, o mesmo valor compra uma quantidade maior.",
          },
          {
            q: "Por que automatizar os aportes?",
            options: ["Para pagar mais taxas", "Para não depender de lembrar ou de força de vontade", "Porque é obrigatório", "Para evitar diversificar"],
            answer: 1,
            explain: "Automatizar transforma investir em hábito.",
          },
        ],
      },
    ],
  },
  {
    id: "mestre",
    title: "Impostos, mente e segurança",
    description: "IR na bolsa, vieses que derrubam investidores e como fugir de golpes.",
    icon: "brain",
    color: "#F43F5E",
    level: "Avançado",
    lessons: [
      {
        id: "ir-bolsa",
        title: "Imposto de renda na bolsa",
        minutes: 6,
        cards: [
          {
            title: "Ações: a isenção de R$ 20 mil",
            body: "No **swing trade** (comprar e vender em dias diferentes), se o total de **vendas** de ações no mês for de até **R$ 20 mil**, o lucro é isento. Acima disso, paga-se **15%** sobre o lucro.",
          },
          {
            title: "Day trade e FIIs",
            body: "- **Day trade** (compra e venda no mesmo dia): **20%** sobre o lucro, sem isenção.\n- **FIIs:** **20%** sobre o lucro na venda das cotas, sem isenção.\n- **ETFs e BDRs:** **15%**, sem a isenção de R$ 20 mil.",
          },
          {
            title: "DARF e prejuízos",
            body: "Você mesmo calcula e paga o imposto pelo **DARF** (código 6015 para pessoa física) até o **último dia útil do mês seguinte** à venda. Prejuízos podem ser usados para abater lucros futuros do mesmo tipo de operação.",
          },
          {
            title: "Declaração anual",
            body: "Todos os investimentos devem aparecer na declaração anual do IR em **Bens e Direitos**, pelo custo de compra, além dos rendimentos isentos e tributáveis recebidos.",
          },
        ],
        quiz: [
          {
            q: "Você vendeu R$ 15 mil em ações no mês, com lucro. Quanto paga de IR?",
            options: ["15% do lucro", "20% do lucro", "Nada, está isento", "22,5% do lucro"],
            answer: 2,
            explain: "Vendas de ações de até R$ 20 mil no mês (swing trade) são isentas.",
          },
          {
            q: "Qual a alíquota sobre o lucro em day trade?",
            options: ["15%", "20%", "Isento", "10%"],
            answer: 1,
            explain: "Day trade é tributado em 20% e não tem isenção.",
          },
          {
            q: "Até quando deve ser pago o DARF de um lucro tributável na bolsa?",
            options: ["No mesmo dia", "Até o último dia útil do mês seguinte", "Só na declaração anual", "Não precisa pagar"],
            answer: 1,
            explain: "O DARF vence no último dia útil do mês seguinte ao da venda.",
          },
        ],
      },
      {
        id: "vieses",
        title: "A mente do investidor",
        minutes: 5,
        cards: [
          {
            title: "Medo e ganância",
            body: "Os maiores erros costumam ser **emocionais**: vender tudo no pânico de uma queda ou comprar no auge da euforia. Ter um plano escrito ajuda a não agir por impulso.",
          },
          {
            title: "Vieses comuns",
            body: "- **FOMO:** medo de ficar de fora — comprar só porque 'todo mundo está ganhando'.\n- **Aversão à perda:** a dor de perder é maior que a alegria de ganhar, o que leva a decisões ruins.\n- **Efeito manada:** seguir a multidão sem pensar.\n- **Ancoragem:** prender-se ao preço que pagou para decidir vender.",
          },
          {
            title: "Antídotos",
            body: "Defina objetivos, alocação e regras **antes** de investir. Revise a carteira com calma, em datas definidas — e não a cada notícia.",
          },
        ],
        quiz: [
          {
            q: "Comprar uma ação só porque ela subiu muito e todos estão falando dela é exemplo de:",
            options: ["Análise fundamentalista", "FOMO / efeito manada", "Rebalanceamento", "Diversificação"],
            answer: 1,
            explain: "É o medo de ficar de fora somado ao comportamento de manada.",
          },
          {
            q: "Qual atitude ajuda a evitar decisões emocionais?",
            options: ["Checar a cotação a cada minuto", "Ter um plano com objetivos e regras definidos antes", "Seguir dicas de grupos", "Vender tudo na primeira queda"],
            answer: 1,
            explain: "Um plano claro reduz decisões por impulso.",
          },
          {
            q: "Decidir vender apenas quando a ação voltar ao preço que você pagou é um exemplo de:",
            options: ["Ancoragem", "Diversificação", "Juros compostos", "Liquidez"],
            answer: 0,
            explain: "O preço de compra vira uma âncora que distorce a decisão.",
          },
        ],
      },
      {
        id: "golpes",
        title: "Protegendo-se de golpes",
        minutes: 5,
        cards: [
          {
            title: "Sinais de alerta",
            body: "- Promessa de **retorno alto e garantido**\n- Pressa: 'só hoje', 'últimas vagas'\n- Ganhar indicando outras pessoas (pirâmide)\n- Robôs ou 'traders' que multiplicam o dinheiro\n- Pedidos de Pix para conta de pessoa física",
          },
          {
            title: "Verifique sempre",
            body: "Antes de investir, confirme se a empresa é **autorizada pela CVM** ou pelo **Banco Central** nos sites oficiais. Instituições sérias nunca pedem sua senha ou códigos por mensagem.",
          },
          {
            title: "Se cair em um golpe",
            body: "Avise o banco imediatamente (o **MED do Pix** permite tentar recuperar valores), registre boletim de ocorrência e denuncie à CVM ou ao Banco Central.",
            highlight: "Parabéns! Concluindo esta aula, você chega ao fim da trilha do Investa.",
          },
        ],
        quiz: [
          {
            q: "Qual destes é um sinal clássico de golpe?",
            options: ["Rendimento atrelado ao CDI", "Promessa de lucro alto garantido e pressa para decidir", "Garantia do FGC", "Taxa de custódia de 0,20%"],
            answer: 1,
            explain: "Retorno alto garantido e urgência são táticas típicas de golpistas.",
          },
          {
            q: "Onde verificar se uma empresa de investimentos é autorizada?",
            options: ["Em grupos de mensagens", "Nos sites oficiais da CVM e do Banco Central", "No perfil da empresa nas redes sociais", "Perguntando ao vendedor"],
            answer: 1,
            explain: "CVM e Banco Central mantêm listas oficiais de instituições autorizadas.",
          },
          {
            q: "Qual mecanismo pode ajudar a recuperar um Pix enviado em golpe?",
            options: ["O FGC", "O MED (Mecanismo Especial de Devolução)", "O Copom", "O IPCA"],
            answer: 1,
            explain: "O MED permite ao banco tentar bloquear e devolver valores de Pix em casos de fraude.",
          },
        ],
      },
    ],
  },
];
