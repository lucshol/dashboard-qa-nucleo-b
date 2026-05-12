# Dashboard QA — Núcleo B
Dashboard executivo conectado ao Notion via API, hospedado no Netlify.

---

## Estrutura de pastas

```
dashboard-road/
├── index.html                   ← Frontend do dashboard (não editar)
├── netlify.toml                 ← Configuração do Netlify
├── README.md                    ← Este arquivo
└── netlify/
    └── functions/
        └── notion.js            ← Proxy seguro para a API do Notion
```

---

## Passo a passo de configuração

### 1. Criar a integração no Notion

1. Acesse: https://www.notion.so/my-integrations
2. Clique em **"New integration"**
3. Dê o nome: `Dashboard Road`
4. Selecione o workspace correto
5. Clique em **Submit**
6. Copie o **Internal Integration Token** (começa com `secret_...`)

---

### 2. Compartilhar o database com a integração

1. Abra o database de QA no Notion:
   https://www.notion.so/50ad9264b5a046baa5ad7a5e3f9916f9
2. Clique nos **···** (três pontinhos) no canto superior direito
3. Clique em **"Connections"** (ou "Conectar a")
4. Busque `Dashboard Road` e clique para conectar
5. Confirme o acesso

---

### 3. Pegar o ID do database

O ID do database já está na URL:
```
https://www.notion.so/50ad9264b5a046baa5ad7a5e3f9916f9
                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                       Este é o DATABASE_ID
```
ID: `50ad9264b5a046baa5ad7a5e3f9916f9`

---

### 4. Configurar variáveis de ambiente no Netlify

1. Acesse: https://app.netlify.com
2. Abra o site `dashboard-road-nucleo-b`
3. Vá em **Site configuration → Environment variables**
4. Clique em **"Add a variable"** e adicione:

| Key | Value |
|-----|-------|
| `NOTION_TOKEN` | `secret_xxxxxxxxxxxxxxxxxxx` (seu token) |
| `NOTION_DATABASE_ID` | `50ad9264b5a046baa5ad7a5e3f9916f9` |

5. Clique em **Save**

---

### 5. Publicar a nova versão

**Opção A — via Netlify Drop (mais simples):**
1. Acesse: https://app.netlify.com/drop
2. Arraste a pasta `dashboard-road` inteira para a área indicada
3. Netlify vai detectar o `netlify.toml` e publicar automaticamente

**Opção B — via GitHub (recomendado para manutenção contínua):**
1. Crie um repositório no GitHub
2. Faça push da pasta `dashboard-road`
3. No Netlify, conecte o repositório: **Add new site → Import from Git**
4. A cada push no GitHub, o dashboard atualiza automaticamente

---

## Como funciona a atualização automática

O dashboard busca os dados do Notion:
- **Ao abrir** a página
- **A cada 5 minutos** automaticamente (configurável em `index.html` — variável `REFRESH_INTERVAL_MS`)
- **Manualmente** clicando no botão "Atualizar"

O token do Notion **nunca é exposto no frontend** — fica protegido na função `netlify/functions/notion.js`, que roda no servidor do Netlify.

---

## Ajustar nomes de propriedades do Notion

Se você renomear colunas no Notion, edite apenas o objeto `PROP_MAP` no arquivo `netlify/functions/notion.js`:

```js
const PROP_MAP = {
  sq4:          'Cliente - Squad 4',      // ← nome exato da coluna no Notion
  sq5_dash:     'Cliente - Squad 5',
  sq5_mdash:    'Cliente — Squad 5',
  frente:       'Frente',
  quinzena:     'Quinzena',
  statusSQ4:    'Status Geral SQ4',
  statusSQ5:    'Status Geral SQ5',
  statusFrente: 'Status da Frente',
  justificativa:'Justificativa e/ou Ação Definida',
};
```

---

## Troubleshooting

| Problema | Causa provável | Solução |
|----------|---------------|---------|
| "Variáveis de ambiente não configuradas" | Token ou ID não adicionados no Netlify | Revisar passo 4 |
| "Erro na API do Notion" com status 401 | Token inválido ou expirado | Gerar novo token |
| "Erro na API do Notion" com status 404 | Database não compartilhado com a integração | Revisar passo 2 |
| Dados não aparecem | Database vazio ou filtro ativo | Verificar filtro de quinzena |
| Dados desatualizados | Cache do browser | Clicar em "Atualizar" ou Ctrl+Shift+R |
