# Guia Netlify + Supabase

## Arquitetura certa

O sistema deve ficar assim:

- Netlify: publica `index.html`, `styles.css`, `app.js` e arquivos estaticos.
- Supabase Auth: login e senha dos usuarios.
- Supabase Database: empresas, pessoas, financeiro, estoque, vendas, auditoria e caixa.
- RLS do Supabase: impede uma empresa de enxergar dados de outra.

## O que ja foi preparado

- `netlify.toml`: configuracao inicial para publicar no Netlify.
- `supabase-config.example.js`: modelo das chaves publicas do Supabase.
- `supabase-config.js`: arquivo que deve receber a URL e a anon key reais.
- `SUPABASE-SCHEMA.sql`: tabelas principais com `company_id` e politicas RLS.
- `CHECKLIST-VENDA.md`: checklist de entrega.

## O que ja foi migrado no codigo

O `app.js` agora detecta quando `supabase-config.js` esta preenchido com dados reais do Supabase. Nesse modo ele:

- limpa cache antigo do navegador antes de carregar dados
- usa Supabase Auth com email e senha
- cria a primeira empresa com a funcao `create_company_for_current_user`
- separa dados por empresa usando `company_id` e RLS
- carrega pessoas, categorias, centros de custo, estoque, financeiro, vendas, itens de venda, caixa e auditoria do Supabase
- recalcula dashboard a partir do banco real
- escuta mudancas em realtime nas tabelas da empresa
- cria, edita e exclui cadastros, estoque e financeiro
- finaliza venda, baixa estoque e cria financeiro
- exclui venda devolvendo estoque e atualizando dashboard
- faz backup e restauracao JSON da empresa

## O que fica para depois

As importacoes por planilha ainda dependiam do servidor Node. Para publicar no Netlify, elas podem ser migradas depois com SheetJS no navegador ou Netlify Functions.

A exportacao Excel no modo Supabase baixa CSV compativel com Excel.

## Passo a passo no Supabase

1. Criar um projeto no Supabase.
2. Abrir SQL Editor.
3. Rodar o arquivo `SUPABASE-SCHEMA.sql`.
4. Ir em Authentication e deixar Email/Senha ativo.
5. Copiar:
   - Project URL
   - anon public key
6. Preencher o arquivo `supabase-config.js`:

```js
window.SUPABASE_CONFIG = {
  url: "https://SEU-PROJETO.supabase.co",
  anonKey: "SUA_CHAVE_ANON_PUBLICA"
};
```

## Passo a passo no Netlify

1. Subir a pasta do sistema para um repositorio Git.
2. Criar site no Netlify.
3. Publicar a raiz do projeto.
4. Garantir que os arquivos estejam publicados:
   - `index.html`
   - `styles.css`
   - `app.js`
   - `supabase-config.js`
   - `netlify.toml`

## Importante

Com `supabase-config.js` preenchido, o sistema roda no modo Supabase para venda e uso multiusuarios.

Com `supabase-config.js` ainda no modelo `SEU-PROJETO`, o sistema continua tentando funcionar no modo local antigo com `server.js`.
