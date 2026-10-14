# Segurança

## Como avisar sobre uma falha

Achou uma falha de segurança no Investa? Avise em particular, **não abra uma issue pública**.

1. Abra a aba **Security** deste repositório.
2. Clique em **Report a vulnerability** e descreva:
   - o que você encontrou e onde (tela, arquivo ou endpoint);
   - como reproduzir, passo a passo;
   - o que alguém conseguiria fazer com isso.

Só o dono do repositório vê o relato. A resposta vem em até 7 dias, e a correção sai numa versão nova o quanto antes. Se quiser, seu nome entra nos agradecimentos da release.

Não inclua senhas, chaves ou dados reais de outras pessoas no relato. Se precisar mostrar algo assim, troque por um exemplo.

## O que vale

- O aplicativo para Windows e Android (código em `core/`, `electron/`, `src/` e `shared/`).
- As regras da nuvem em [`supabase/schema.sql`](supabase/schema.sql).
- Os workflows em `.github/workflows/`.

Ficam de fora problemas nos serviços de terceiros (NVIDIA, Groq, Supabase, Yahoo Finance, Banco Central etc.). Esses devem ser avisados a eles.

## Versões com correção

Só a versão mais recente da página de [Releases](../../releases) recebe correções. Atualize sempre.
