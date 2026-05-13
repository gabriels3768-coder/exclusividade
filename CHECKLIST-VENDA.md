# Checklist para vender o Sistema Exclusividade

## 1. Dados e estoque

- Validar cadastro, edicao e exclusao de produtos.
- Confirmar que venda baixa estoque imediatamente.
- Confirmar que importacao por planilha soma/atualiza estoque corretamente.
- Conferir alerta de estoque minimo.

## 2. Financeiro

- Testar contas a receber.
- Testar contas a pagar.
- Testar baixa total e baixa parcial.
- Conferir fechamento de caixa.
- Conferir relatorios financeiros por periodo.

## 3. Login e seguranca

- Criar primeiro administrador.
- Criar usuario financeiro, estoque e vendas.
- Testar se cada perfil enxerga apenas as telas permitidas.
- Trocar senha do usuario logado.
- Conferir auditoria de login, cadastro, exclusao e exportacao.

## 4. Backup

- Fazer download do backup antes da entrega.
- Restaurar backup em ambiente de teste.
- Confirmar que o sistema volta com os dados restaurados.
- Em nuvem, contratar disco persistente para a pasta `data`.

## 5. Visual profissional

- Conferir textos principais sem erros.
- Testar em notebook e celular.
- Conferir tabelas com muitos registros.
- Validar botoes de editar, excluir, imprimir e exportar.

## 6. Empacotamento e entrega

- Rodar `npm run check`.
- Rodar `npm start`.
- Acessar `/health`.
- Criar usuario administrador do cliente.
- Configurar o nome da empresa no topo do dashboard.
- Fazer backup inicial zerado.
- Entregar manual, link de acesso e usuario inicial.

## Situacao atual

O sistema ja possui login, perfis, auditoria, backup local, restauracao, estoque, financeiro, PDV, relatorios e exportacoes.

Para venda em nuvem, o caminho recomendado agora e publicar o servidor Node em hospedagem com disco persistente. Para vender varias empresas dentro do mesmo ambiente, a proxima etapa e adicionar camada multiempresa com `empresa_id` em todas as tabelas.
