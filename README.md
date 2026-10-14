<p align="center">
  <img src="build/icon.png" width="88" alt="Ícone do Investa">
</p>

<h1 align="center">Investa</h1>

<p align="center">
  Aplicativo para Windows e Android que ajuda a aprender a investir e a organizar as finanças pessoais.
</p>

<p align="center">
  <a href="https://github.com/brunoosz/Investa/releases/latest"><img src="https://img.shields.io/badge/Baixar_para_Windows-2563EB?style=for-the-badge&logo=windows&logoColor=white" alt="Baixar para Windows" height="34"></a>
  <a href="https://github.com/brunoosz/Investa/releases/latest"><img src="https://img.shields.io/badge/Baixar_para_Android-0A8440?style=for-the-badge&logo=android&logoColor=white" alt="Baixar para Android" height="34"></a>
</p>

<p align="center">
  <a href="https://github.com/brunoosz/Investa/releases/latest"><img src="https://img.shields.io/github/v/release/brunoosz/Investa?label=vers%C3%A3o&color=2563EB" alt="Versão"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/licen%C3%A7a-MIT-111113" alt="Licença MIT"></a>
</p>

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/capa-escuro.png">
  <source media="(prefers-color-scheme: light)" srcset="docs/media/capa-claro.png">
  <img src="docs/media/capa-escuro.png" alt="Tela inicial do Investa com patrimônio, carteira, aulas, objetivos e indicadores do dia">
</picture>

## Sobre o projeto

O Investa é um projeto pessoal e pequeno, feito por um desenvolvedor iniciante para uso próprio e como forma de aprender programação. Ele junta num lugar só o que eu precisava no dia a dia: aulas curtas sobre investimentos, cotações do mercado, controle de gastos e faturas, metas e uma lista de compras.

Não é um produto comercial, não tem anúncios e não vende nada. O conteúdo é educativo e **não é recomendação de investimento**.

## Privacidade

- **Seus dados são só seus.** Cada conta só consegue ler e alterar os próprios dados. Nenhum outro usuário do app vê o que você cadastra.
- **Sem a sincronização ligada, tudo fica no seu aparelho.** Com ela ligada, os dados vão para um banco de dados protegido por regras de acesso por conta, para aparecer no PC e no celular.
- **Senhas** são guardadas com criptografia (hash), nunca em texto puro.
- **Assistente:** quando você faz uma pergunta, ela é enviada ao serviço de IA junto com os dados necessários para responder. As outras telas não mandam nada seu para fora.
- Cotações, juros e notícias vêm de fontes públicas (Yahoo Finance, Banco Central, Tesouro Direto e portais de notícias).

## O que o app faz

| Tela | O que faz |
|---|---|
| Início | Patrimônio, divisão da carteira, objetivos, indicadores do dia (Selic, CDI, IPCA, dólar, Ibovespa) e notícias |
| Aulas | 30 aulas curtas em 10 módulos, do básico até montar uma carteira, com quiz, XP e glossário |
| Mercado | Ações, FIIs, ETFs, BDRs, Tesouro Direto, renda fixa, cripto, moedas, índices e commodities, com gráficos |
| Carteira | Seus investimentos em renda variável e renda fixa, com rendimento atualizado |
| Gastos | Lançamentos por categoria e cartão, parcelas, faturas, contas fixas e quanto ainda dá para gastar no mês |
| Lista de compras | Itens do mercado com quantidade e preço, total da lista e exportação |
| Objetivos | Metas com valor e prazo, projeção com os juros atuais e caixinhas automáticas |
| Meu plano | Um plano para chegar no seu objetivo, com projeção e checklist |
| Vale a pena? | Preço de um produto ou jogo e se a compra cabe no seu mês |
| Assistente | Chat de IA que explica investimentos e ajuda com o orçamento usando os seus números |
| Bancos | Comparação de bancos e corretoras e juros de crédito do Banco Central |
| Simulador | R$ 100 mil virtuais para treinar compra e venda com preços reais |
| Alertas | Avisos de preço, de datas do mercado e de contas a vencer |

<img src="docs/media/mercado.gif" alt="Navegando pelo Mercado e abrindo o gráfico de uma ação" width="100%">

<p align="center">
  <img src="docs/media/aula.gif" alt="Respondendo ao quiz de uma aula" width="82%">
</p>

<img src="docs/media/gastos.gif" alt="Lançando uma compra parcelada no cartão" width="100%">

### No celular

O app Android tem as mesmas telas do Windows, com a navegação adaptada para a tela pequena. Dá para escolher quais telas ficam na barra de baixo.

<p align="center">
  <img src="docs/media/celular.png" alt="Início, Gastos e Carteira no celular" width="90%">
</p>

### Mais telas

<table>
  <tr>
    <td width="50%"><img src="docs/media/carteira.png" alt="Carteira"><br><sub>Carteira dividida por tipo de investimento</sub></td>
    <td width="50%"><img src="docs/media/objetivo-projecao.png" alt="Projeção de uma meta"><br><sub>Projeção de uma meta</sub></td>
  </tr>
  <tr>
    <td><img src="docs/media/ativo.png" alt="Página de um ativo"><br><sub>Página de um ativo com os indicadores explicados</sub></td>
    <td><img src="docs/media/bancos.png" alt="Comparação de bancos"><br><sub>Comparação de bancos e corretoras</sub></td>
  </tr>
  <tr>
    <td><img src="docs/media/alertas.png" alt="Alertas"><br><sub>Alertas</sub></td>
    <td><img src="docs/media/simulador.png" alt="Simulador"><br><sub>Simulador</sub></td>
  </tr>
</table>

<sub>As imagens usam uma conta de demonstração. Os valores da carteira e dos gastos são fictícios.</sub>

## Download

Baixe a versão mais recente na página de [Releases](https://github.com/brunoosz/Investa/releases/latest).

| Arquivo | Para quê |
|---|---|
| `Investa-Setup-<versão>.exe` | Instalador para Windows 10 ou 11 |
| `Investa-Portatil-<versão>.exe` | Versão para Windows que roda sem instalar |
| `Investa-Android-<versão>.apk` | App para Android 7 ou mais novo |

**Windows:** o app não tem certificado de assinatura digital (é caro para um projeto pessoal), então o Windows pode mostrar "O Windows protegeu o computador". Clique em **Mais informações → Executar assim mesmo**.

**Android:** baixe o `.apk` pelo celular e abra o arquivo. Na primeira vez, o Android pede para permitir a instalação de apps de fora da Play Store.

Baixe os arquivos só pela página de Releases deste repositório.

## Feito com

React, TypeScript, Vite e Tailwind CSS na interface, Electron no Windows e Capacitor no Android.

## Limitações

- É um projeto de iniciante, então pode ter falhas. Se encontrar alguma, abra uma [issue](https://github.com/brunoosz/Investa/issues).
- As cotações da B3 podem ter até 15 minutos de atraso.
- Não há versão para iPhone.
- Nenhum app é 100% seguro. Problemas de segurança devem ser avisados em particular, como explicado no [SECURITY.md](SECURITY.md).

## Licença

Criado e mantido por **Bruno Camperlingo**. Distribuído sob a licença MIT. Veja o arquivo [LICENSE](LICENSE).
