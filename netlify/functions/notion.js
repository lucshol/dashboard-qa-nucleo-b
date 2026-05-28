// netlify/functions/notion.js
// ══════════════════════════════════════════════════════════════
// ARQUITETURA DE DADOS
// ══════════════════════════════════════════════════════════════
// Fonte A — DATABASE_ID (Registros de QA)
//   → vinculada à quinzena
//   → usada para: contagem de registros, gráficos, QA por frente,
//                 comparativo, tabela, termômetro
//
// Fonte B — CONTAS_DB_ID (Status Geral | Contas)
//   → NUNCA vinculada à quinzena — sempre estado atual
//   → usada para: % por status, cards de clientes, oportunidades
//
// Fonte C — CHECKLIST_DB_ID (Checklist de Execução)
//   → vinculada à quinzena
//   → usada para: termômetro de liderança
// ══════════════════════════════════════════════════════════════

const DATABASE_ID     = process.env.NOTION_DATABASE_ID;
const CHECKLIST_DB_ID = process.env.NOTION_CHECKLIST_DB_ID;
const CONTAS_DB_ID    = process.env.NOTION_CONTAS_DB_ID;
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
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Variáveis não configuradas.' }) };
  }

  try {
    // Busca paralela das três fontes
    const [qaResults, checklistResults, contasResults] = await Promise.all([
      queryDatabase(DATABASE_ID),
      CHECKLIST_DB_ID ? queryDatabase(CHECKLIST_DB_ID) : Promise.resolve([]),
      CONTAS_DB_ID    ? queryDatabase(CONTAS_DB_ID)    : Promise.resolve([]),
    ]);

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        // Fonte A — quinzenal
        qa:         transformQA(qaResults),
        // Fonte B — operacional (sem quinzena)
        contas:     transformContas(contasResults),
        // Fonte C — quinzenal
        termometro: transformTermometro(checklistResults),
        fetchedAt:  new Date().toISOString(),
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};

// ── Paginação ──────────────────────────────────────────────────
async function queryDatabase(dbId) {
  let all = [], cursor;
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
    if (!res.ok) { const e = await res.json(); throw new Error(`Notion ${res.status}: ${JSON.stringify(e)}`); }
    const d = await res.json();
    all = all.concat(d.results);
    cursor = d.has_more ? d.next_cursor : undefined;
  } while (cursor);
  return all;
}

// ── Helper de propriedades ─────────────────────────────────────
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
    default:             return '';
  }
}

function norm(s) {
  if (!s) return '';
  return s.toUpperCase().replace(/O[\u0301]TIMO/gi, 'ÓTIMO').replace('OTIMO', 'ÓTIMO');
}

// ══════════════════════════════════════════════════════════════
// FONTE A — QA (quinzenal)
// Database: Registros de QA — Novo
// ══════════════════════════════════════════════════════════════
function transformQA(results) {
  return results.map(p => ({
    id:            p.id,
    cliente:       getProp(p.properties, 'Cliente'),
    squad:         getProp(p.properties, 'Squad'),
    frente:        norm(getProp(p.properties, 'Frente')),
    quinzena:      getProp(p.properties, 'Quinzena'),
    statusGeral:   getProp(p.properties, 'Status Geral'),
    statusFrente:  norm(getProp(p.properties, 'Status da Frente')),
    oQueAconteceu: getProp(p.properties, 'O que aconteceu'),
    proximaAcao:   getProp(p.properties, 'Próxima ação'),
  })).filter(r => r.cliente);
}

// ══════════════════════════════════════════════════════════════
// FONTE B — CONTAS (operacional — sem quinzena)
// Database: Status Geral | Contas
// Campos: Cliente, Squad, Status Geral, Motivo do status geral,
//         Escopo, Data de renovação, Atualização do status,
//         Tipo, Possibilidades, Status do contato,
//         Atualização da oportunidade
// ══════════════════════════════════════════════════════════════
function transformContas(results) {
  return results.map(p => ({
    id:                      p.id,
    nome:                    getProp(p.properties, 'Cliente'),
    squad:                   getProp(p.properties, 'Squad'),
    // campos de visão geral
    statusGeral:             getProp(p.properties, 'Status Geral'),
    motivoStatus:            getProp(p.properties, 'Motivo do status geral'),
    escopo:                  getProp(p.properties, 'Escopo'),
    dataRenovacao:           getProp(p.properties, 'Data de renovação'),
    atualizacaoStatus:       getProp(p.properties, 'Atualização do status'),
    // campos de oportunidades
    tipo:                    getProp(p.properties, 'Tipo'),
    possibilidades:          getProp(p.properties, 'Possibilidades'),
    statusContato:           getProp(p.properties, 'Status do contato'),
    atualizacaoOportunidade: getProp(p.properties, 'Atualização da oportunidade'),
  })).filter(r => r.nome);
}

// ══════════════════════════════════════════════════════════════
// FONTE C — TERMÔMETRO (quinzenal)
// Database: Checklist de Execução
// ══════════════════════════════════════════════════════════════
const NOTA_SCORE = { '🟢 Forte': 2, '🟡 Em desenvolvimento': 1, '🔴 Ponto de atenção': 0 };

function transformTermometro(results) {
  return results.map(p => {
    const nota = getProp(p.properties, 'Nota');
    return {
      id:       p.id,
      lider:    getProp(p.properties, 'Líder'),
      quinzena: getProp(p.properties, 'Quinzena'),
      criterio: getProp(p.properties, 'Critério'),
      nota,
      score:    NOTA_SCORE[nota] ?? -1,
      obs:      getProp(p.properties, 'Observação'),
    };
  }).filter(r => r.lider && r.criterio);
}
