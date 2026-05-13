# Manual do Usuario

## Acesso

1. Abra o sistema pelo arquivo `abrir-sistema.bat` ou `iniciar-sistema.bat`
2. Entre com o usuario e senha cadastrados
3. Ao entrar, troque a senha em `Trocar Senha`

## Menu principal

- `Pessoas`: clientes, funcionarios, usuarios e fornecedores
- `Financeiro`: contas, limite de credito, centro de custo e fechamento de caixa
- `Estoque`: categorias, produtos, entrada por planilha e lista de produtos
- `PDV`: vendas e historico
- `Relatorios`: clientes, recebimentos, despesas, vendas, lucro e auditoria

## Fluxo basico de uso

### 1. Cadastrar cliente

1. Abra `Pessoas > Clientes`
2. Preencha nome, documento, telefone e observacoes
3. Salve o cadastro

### 2. Cadastrar produto

1. Abra `Estoque > Categorias` e crie a categoria
2. Abra `Estoque > Produtos`
3. Informe codigo, categoria, fornecedor, custo, preco e estoque minimo
4. Salve o produto

### 3. Dar entrada por planilha

1. Abra `Estoque > Entrada por Planilha`
2. Baixe a planilha modelo
3. Preencha cabecalho da nota e produtos
4. Importe a planilha

### 4. Vender no PDV

1. Abra `PDV > Vendas`
2. Digite o codigo ou nome do produto
3. Inclua os itens
4. Escolha cliente e forma de pagamento
5. Finalize a venda

### 5. Baixar contas

1. Abra `Financeiro > Contas a Receber` ou `Contas a Pagar`
2. Clique em `Pagar`
3. Informe valor integral ou parcial
4. Confirme a baixa

### 6. Fechar caixa

1. Abra `Financeiro > Fechamento de Caixa`
2. Informe a data e saldo inicial
3. Clique em `Atualizar resumo`
4. Clique em `Fechar caixa`

## Backup

1. Na tela inicial clique em `Fazer Backup`
2. Guarde o arquivo em local seguro

## Restauracao

1. Clique em `Restaurar Backup`
2. Escolha o arquivo de backup
3. Confirme a restauracao

## Relatorios

- use `Data inicial` e `Data final`
- pressione `Enter` para recarregar
- exporte em `Excel`, `CSV` ou `PDF`

## Auditoria

- mostra acessos, vendas, cadastros e alteracoes
- pode ser limpa por periodo em `Relatorios > Auditoria`
