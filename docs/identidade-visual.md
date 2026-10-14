# Identidade visual do Investa

Inspiração: `referencia-slush.md` (princípios, não cópia). Ideia: **caderno de finanças com adesivos**. Fundo de papel liso, tinta escura, cores chapadas em blocos, contorno fino. Sem sombra, sem gradiente, sem brilho.

## Tipografia
- **Destaque:** Inter Variable 800, entrelinha 1.0, tracking -0.035em. Só em títulos de tela e no número principal (saldo, patrimônio, total).
- **Leitura:** Inter Variable 450 (corpo), 600 (rótulos), 700 (botões, com tracking +0.02em).
- **Números:** sempre tabulares (`tnum` ligado no app inteiro). Valores em R$ nunca mudam de largura.

## Cores (tokens em `src/index.css`)
| Papel | Claro | Escuro |
| --- | --- | --- |
| Papel (`bg`) | #F3EFE6 | #111113 |
| Card (`surface`) | #FFFFFF | #1A1A1D |
| Tinta (`ink`, texto e contorno) | #111113 | #F4F1EA |
| Destaque (`primary`, seleção, links, foco) | #2563EB | #5C96FF |
| **Ganho** (`success`) | #0A8440 | #3DDC84 |
| **Perda** (`danger`) | #D22B2B | #FF6B6B |
| Atenção (`warning`) | #B07000 | #FFCE4D |

**Adesivos** (só decoração e blocos, nunca para ganho/perda): `sticker-sun` (amarelo), `sticker-sky` (azul claro), `sticker-lilac` (lilás), `sticker-coral` (salmão), `sticker-sand` (areia). Usadas só como tom leve (10–14%), o texto fica na cor do tema.

Regra: ganho e perda são as únicas cores que comunicam resultado. Verde/vermelho nunca viram decoração.

## Assinatura
1. **As três barras.** O desenho da logo reaparece pequeno: marca ao lado do título das seções, indicador de carregamento (as barras enchem em sequência) e abertura do app.
2. **Bloco de destaque minimalista.** O número mais importante de cada tela fica num card com um tom leve (10–14%) de uma cor de adesivo e o contorno normal. Nada de bloco de cor forte.

## Forma
- Base de 4px. Padding de card 20px (16px no celular). Entre seções 32px.
- Botões, abas, filtros e etiquetas: **pílula**. Cards: canto 20px. Campos: canto 14px.
- Contorno: 1px de tinta nos elementos interativos secundários (botão de contorno, filtros, abas); 1px de tinta a 12% nos cards. **Sem sombra.** Janelas e avisos se separam por contorno, não por sombra.
- Botão principal: pílula de tinta (preta no claro, papel no escuro). Um por tela.

## Movimento
Pequenos detalhes, nunca enfeite: cabeçalho que encolhe ao rolar, entrada em sequência na primeira abertura da tela, número principal que conta até o valor, toque que afunda (e vibra no Android nas ações principais), troca de tela com fade curto. Só `transform`/`opacity`, até 300ms, e tudo some com "reduzir movimento".

## Tom de voz
Direto, simples, em português do dia a dia. Diz o que a tela faz ou o número que importa. Sem "Bem-vindo!", sem frase motivacional, sem exclamação à toa. Ex.: "Entrar", "Seu patrimônio", "Falta comprar", "Sem gastos este mês".
