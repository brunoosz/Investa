# Visual do Investa

Referência das peças do visual novo. Toda tela usa só estes tokens; nada de cor ou tamanho escrito direto no código.

## Cores (tokens em `src/index.css`, com versão clara e escura)
- Base: `bg`, `surface`, `elevated`, `fg`, `muted`, `line`, `separator`.
- Ação e estado: `primary`, `secondary`, `success`, `danger`, `warning`.
- Categorias: `cat-alimentos`, `cat-bebidas`, `cat-limpeza`, `cat-higiene`, `cat-casa`, `cat-eletronicos`, `cat-jogos`, `cat-roupas`, `cat-outros`.
- Gráficos: `chart-1` … `chart-11` (`PALETTE` em `components/charts/small.tsx`). Séries do `Chart` aceitam o nome do token (`"primary"`, `"chart-3"`).
- Ícones coloridos: `IconTile`/`ListRow` recebem o nome do token (`iconColor="success"`).
- Exceção: cores que são dados (cor de um banco, cor escolhida para um objetivo, logos dos ativos) continuam como estão.

## Tipografia (Tailwind)
`text-large-title` (títulos de tela), `text-title` (seções e janelas), `text-headline` (título de card/linha), `text-body`, `text-callout`, `text-footnote` (secundário), `text-caption` (rótulo em maiúsculas: usar com `uppercase`). Números: `tabular`.

## Cantos e materiais
- `rounded-chip` (10px), `rounded-control` (14px: botões, campos), `rounded-card` (20px: cards), `rounded-sheet` (28px: janelas).
- Card: `Card`/`.surface`. Barras e menus flutuantes: `.material-regular`/`.glass`. Barra lateral: `.material-thick`. Divisórias: `border-separator/10`.

## Movimento
- Curvas: `ease-out-strong` / `var(--ease-out)`; pressionar: `.pressable` (escala 0,97).
- Molas de interface: `{ type: "spring", bounce: 0, duration: 0.3 }`.
- Sem animação em ações de teclado; tudo respeita "reduzir movimento" (`MotionConfig reducedMotion="user"`).
