// netlify/functions/notion.js
// Proxy seguro para a API do Notion.
// O token NUNCA é exposto no frontend.

const DATABASE_ID     = process.env.NOTION_DATABASE_ID;      // QA (database novo)
const CHECKLIST_DB_ID = process.env.NOTION_CHECKLIST_DB_ID;  // Termômetro de Liderança
const CONTAS_DB_ID    = process.env.NOTION_CONTAS_DB_ID;     // Contas / Oportunidades
const NOTION_TOKEN    = process.env.NOTION_TOKEN;
const NOTION_VERSION  = '2022-06-28';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  if (!NOTION_TOKEN || !DATABASE_ID) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Variáveis de ambiente não configuradas.' }),
    };
  }

  try {
    // Busca paralela dos três databases
    const [qaRows, checklistRows, contasRows] = await Promise.all([
      queryDatabase(DATABASE_ID),
      CHECKLIST_DB_ID ? queryDatabase(CHECKLIST_DB_ID) : Promise.resolve([]),
      CONTAS_DB_ID    ? queryDatabase(CONTAS_DB_ID)    : Promise.resolve([]),
    ]);

    const rows          = transformQAData(qaRows);
    const termometro    = transformTermometroData(checklistRows);
    const oportunidades = transformContasData(contasRows);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        rows,
        termometro,
        oportunidades,
        total: rows.length,
        fetchedAt: new Date().toISOString(),
      }),
    };
  } catch (err) {
    return {
      statusCode: 500, headers,
      body: JSON.stringify({ error: 'Erro interno', detail: err.message }),
    };
  }
};

// ─── Paginação automática ─────────────────────────────────────────
async function queryDatabase(dbId) {
  let allResults = [];
  let cursor     = undefined;
  do {
    const body = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
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
      throw new Error(`Notion API ${res.status}: ${JSON.stringify(err)}`);
    }
    const data = await res.json();
    allResults  = allResults.concat(data.results);
    cursor      = data.has_more ? data.next_cursor : undefined;
  } while (cursor);
  return allResults;
}

// ─── Helper genérico de propriedades ─────────────────────────────
function getProp(props, key) {
  const p = props[key];
  if (!p) return '';
  switch (p.type) {
    case 'title':        return p.title?.map(t => t.plain_text).join('')     || '';
    case 'rich_text':    return p.rich_text?.map(t => t.plain_text).join('') || '';
    case 'select':       return p.select?.name || '';
    case 'multi_select': return p.multi_select?.map(s => s.name).join(', ')  || '';
    case 'date':         return p.date?.start || '';
    case 'number':       return p.number ?? '';
    case 'checkbox':     return p.checkbox;
    case 'formula':      return p.formula?.string || p.formula?.number || '';
    default:             return '';
  }
}

function norm(s) {
  if (!s) return '';
  return s.toUpperCase()
    .replace(/O[\u0301]TIMO/gi, 'ÓTIMO')
    .replace('OTIMO', 'ÓTIMO');
}

// ═════════════════════════════════════════════════════════════════
// MAPEAMENTOS — ajuste aqui se renomear colunas no Notion
// ═════════════════════════════════════════════════════════════════

// Database de QA (novo — estrutura correta com campo Squad único)
const QA_MAP = {
  registro:      'Registro',
  cliente:       'Cliente',
  squad:         'Squad',
  frente:        'Frente',
  quinzena:      'Quinzena',
  statusGeral:   'Status Geral',
  statusFrente:  'Status da Frente',
  oQueAconteceu: 'O que aconteceu',
  proximaAcao:   'Próxima ação',
};

// Database de Termômetro de Liderança
const TL_MAP = {
  lider:     'Líder',
  quinzena:  'Quinzena',
  criterio:  'Critério',
  nota:      'Nota',
  obs:       'Observação',
};

// Database de Contas / Oportunidades
const CONTAS_MAP = {
  nome:           'Nome da conta',
  status:         'Status',
  squad:          'Squad',
  tipo:           'Oportunidade em aberto',
  possibilidades: 'Observações',
  motivoStatus:   'Motivo do status',
  dataRenovacao:  'Data de renovação',
  kpi:            'KPI principal',
};

// ═════════════════════════════════════════════════════════════════
// TRANSFORMAÇÕES
// ═════════════════════════════════════════════════════════════════

// QA — nova estrutura (1 registro = 1 cliente + 1 squad + 1 frente)
function transformQAData(results) {
  return results
    .map(page => {
      const p = page.properties || {};
      return {
        id:            page.id,
        cliente:       getProp(p, QA_MAP.cliente),
        squad:         getProp(p, QA_MAP.squad),       // 'Squad 4' ou 'Squad 5'
        frente:        norm(getProp(p, QA_MAP.frente)),
        quinzena:      getProp(p, QA_MAP.quinzena),
        statusGeral:   getProp(p, QA_MAP.statusGeral),
        statusFrente:  norm(getProp(p, QA_MAP.statusFrente)),
        oQueAconteceu: getProp(p, QA_MAP.oQueAconteceu),
        proximaAcao:   getProp(p, QA_MAP.proximaAcao),
      };
    })
    .filter(r => r.cliente); // remove linhas vazias
}

// Termômetro de Liderança
const NOTA_SCORE = {
  '🟢 Forte': 2,
  '🟡 Em desenvolvimento': 1,
  '🔴 Ponto de atenção': 0,
};

function transformTermometroData(results) {
  return results
    .map(page => {
      const p = page.properties || {};
      const nota = getProp(p, TL_MAP.nota);
      return {
        id:       page.id,
        lider:    getProp(p, TL_MAP.lider),
        quinzena: getProp(p, TL_MAP.quinzena),
        criterio: getProp(p, TL_MAP.criterio),
        nota,
        score:    NOTA_SCORE[nota] ?? -1, // -1 = sem nota
        obs:      getProp(p, TL_MAP.obs),
      };
    })
    .filter(r => r.lider && r.criterio);
}

// Contas / Oportunidades
function transformContasData(results) {
  return results
    .map(page => {
      const p = page.properties || {};
      return {
        id:             page.id,
        nome:           getProp(p, CONTAS_MAP.nome),
        status:         getProp(p, CONTAS_MAP.status),
        squad:          getProp(p, CONTAS_MAP.squad),
        tipo:           getProp(p, CONTAS_MAP.tipo),
        possibilidades: getProp(p, CONTAS_MAP.possibilidades),
        motivoStatus:   getProp(p, CONTAS_MAP.motivoStatus),
        dataRenovacao:  getProp(p, CONTAS_MAP.dataRenovacao),
        kpi:            getProp(p, CONTAS_MAP.kpi),
      };
    })
    .filter(r => r.tipo && r.tipo !== 'Nenhuma' && r.nome);
}
