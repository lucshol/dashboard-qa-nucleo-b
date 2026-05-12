// netlify/functions/notion.js
// Proxy seguro para a API do Notion.
// O token NUNCA é exposto no frontend — fica só aqui nas variáveis de ambiente do Netlify.

const DATABASE_ID = process.env.NOTION_DATABASE_ID;
const NOTION_TOKEN = process.env.NOTION_TOKEN;
const NOTION_VERSION = '2022-06-28';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (!NOTION_TOKEN || !DATABASE_ID) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Variáveis de ambiente não configuradas. Veja o README.' }),
    };
  }

  try {
    let allResults = [];
    let cursor = undefined;

    // Pagina automaticamente até buscar todos os registros (Notion retorna max 100 por vez)
    do {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;

      const res = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${NOTION_TOKEN}`,
          'Notion-Version': NOTION_VERSION,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        return {
          statusCode: res.status,
          headers,
          body: JSON.stringify({ error: 'Erro na API do Notion', detail: err }),
        };
      }

      const data = await res.json();
      allResults = allResults.concat(data.results);
      cursor = data.has_more ? data.next_cursor : undefined;
    } while (cursor);

    // Transforma os dados brutos do Notion no formato que o dashboard espera
    const rows = transformNotionData(allResults);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ rows, total: rows.length, fetchedAt: new Date().toISOString() }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Erro interno', detail: err.message }),
    };
  }
};

// ─── Transformação de dados ──────────────────────────────────────────────────
// Mapeia as propriedades do Notion para o formato interno do dashboard.
// Se você renomear colunas no Notion, ajuste apenas este objeto:
const PROP_MAP = {
  sq4:          'Cliente - Squad 4',
  sq5_dash:     'Cliente - Squad 5',    // com hífen normal
  sq5_mdash:    'Cliente \u2014 Squad 5', // com travessão longo (—)
  frente:       'Frente',
  quinzena:     'Quinzena',
  statusSQ4:    'Status Geral SQ4',
  statusSQ5:    'Status Geral SQ5',
  statusFrente: 'Status da Frente',
  justificativa:'Justificativa e/ou Ação Definida',
};

function getProp(props, key) {
  const p = props[key];
  if (!p) return '';
  switch (p.type) {
    case 'title':       return p.title?.map(t => t.plain_text).join('') || '';
    case 'rich_text':   return p.rich_text?.map(t => t.plain_text).join('') || '';
    case 'select':      return p.select?.name || '';
    case 'multi_select':return p.multi_select?.map(s => s.name).join(', ') || '';
    case 'date':        return p.date?.start || '';
    case 'number':      return p.number ?? '';
    case 'checkbox':    return p.checkbox ? 'true' : 'false';
    case 'formula':     return p.formula?.string || p.formula?.number || '';
    default:            return '';
  }
}

function normalizeStatus(s) {
  if (!s) return '';
  return s.toUpperCase()
    .replace(/O[\u0301]TIMO/gi, 'ÓTIMO')
    .replace('OTIMO', 'ÓTIMO');
}

function transformNotionData(results) {
  const rows = [];

  results.forEach(page => {
    const p = page.properties || {};

    const sq4 = getProp(p, PROP_MAP.sq4);
    const sq5 = getProp(p, PROP_MAP.sq5_dash) || getProp(p, PROP_MAP.sq5_mdash);
    const frente = normalizeStatus(getProp(p, PROP_MAP.frente));
    const quinzena = getProp(p, PROP_MAP.quinzena);
    const statusSQ4 = getProp(p, PROP_MAP.statusSQ4);
    const statusSQ5 = getProp(p, PROP_MAP.statusSQ5);
    const statusFrente = normalizeStatus(getProp(p, PROP_MAP.statusFrente));
    const justificativa = getProp(p, PROP_MAP.justificativa);

    // Uma linha do Notion pode ter SQ4 e SQ5 preenchidos simultaneamente
    // Geramos uma entrada para cada squad presente
    if (sq4) {
      rows.push({
        id: page.id,
        cliente: sq4,
        squad: 'SQ4',
        frente,
        quinzena,
        statusGeralSQ4: statusSQ4,
        statusGeralSQ5: '',
        statusDaFrente: statusFrente,
        justificativa,
      });
    }
    if (sq5) {
      rows.push({
        id: page.id,
        cliente: sq5,
        squad: 'SQ5',
        frente,
        quinzena,
        statusGeralSQ4: '',
        statusGeralSQ5: statusSQ5,
        statusDaFrente: statusFrente,
        justificativa,
      });
    }
  });

  return rows;
}
