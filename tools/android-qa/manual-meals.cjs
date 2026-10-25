'use strict';
const FIELDS = new Set(['id', 'user_id', 'nume', 'tip_masa', 'calorii', 'proteine', 'carbohidrati', 'grasimi', 'fibre', 'alimente', 'imagine_url', 'data', 'ora', 'created_at']);
const MAX_MEALS = 128;
const invalid = () => { throw new Error('INVALID_SYNTHETIC_MEAL'); };

function validate(input, previous, state) {
  const body = Array.isArray(input) && input.length === 1 ? input[0] : input;
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !FIELDS.has(key))) invalid();
  const row = { ...previous, ...body };
  if (row.id === undefined) row.id = String(++state.nextMealId);
  row.id = String(row.id);
  if (!/^[1-9]\d{0,18}$/.test(row.id) || BigInt(row.id) > 9223372036854775807n) invalid();
  if (previous && row.id !== previous.id) invalid();
  if (typeof row.nume !== 'string' || !row.nume.trim() || row.nume.length > 200 || typeof row.tip_masa !== 'string' || row.tip_masa.length > 40) invalid();
  for (const key of ['calorii', 'proteine', 'carbohidrati', 'grasimi']) {
    if (!Number.isSafeInteger(row[key]) || row[key] < 0) invalid();
  }
  if (!Number.isFinite(row.fibre) || row.fibre < 0 || !Array.isArray(row.alimente) || row.alimente.length > 50) invalid();
  if (row.imagine_url !== null && row.imagine_url !== undefined) invalid();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(row.data) || !/^\d{2}:\d{2}:\d{2}$/.test(row.ora)) invalid();
  if (new Date(`${row.data}T00:00:00Z`).toISOString().slice(0, 10) !== row.data) invalid();
  if (typeof row.created_at !== 'string' || !row.created_at.endsWith('Z') || !Number.isFinite(Date.parse(row.created_at))) invalid();
  row.created_at = new Date(row.created_at).toISOString();
  return row;
}

function selectRows(url, state) {
  let rows = [...state.meals.values()];
  for (const key of ['id', 'user_id', 'data', 'created_at']) {
    for (const condition of url.searchParams.getAll(key)) {
      const match = /^(eq|gte|lte)\.(.+)$/.exec(condition);
      if (!match || (key !== 'created_at' && match[1] !== 'eq')) invalid();
      const [, op, value] = match;
      rows = rows.filter((row) => {
        const left = key === 'created_at' ? Date.parse(row[key]) : String(row[key]);
        const right = key === 'created_at' ? Date.parse(value) : value;
        return op === 'eq' ? left === right : op === 'gte' ? left >= right : left <= right;
      });
    }
  }
  const order = url.searchParams.get('order');
  if (order) {
    if (!/^created_at\.(asc|desc)$/.test(order)) invalid();
    rows.sort((a, b) => (Date.parse(a.created_at) - Date.parse(b.created_at)) * (order.endsWith('desc') ? -1 : 1));
  }
  const fields = url.searchParams.get('select');
  if (fields && fields !== '*') {
    const keys = fields.split(',');
    if (keys.some((key) => !FIELDS.has(key))) invalid();
    rows = rows.map((row) => Object.fromEntries(keys.map((key) => [key, row[key]])));
  }
  return rows;
}

async function handleMeals(req, res, url, state, { reply, readJson, userId }) {
  const owner = url.searchParams.get('user_id');
  if (owner && owner !== `eq.${userId}`) return reply(res, 403, { code: 'SYNTHETIC_USER_ONLY' });
  if (req.method === 'GET') {
    const rows = selectRows(url, state);
    if (!req.headers.accept?.includes('application/vnd.pgrst.object+json')) return reply(res, 200, rows);
    return rows.length <= 1 ? reply(res, 200, rows[0] ?? null) : reply(res, 406, { code: 'PGRST116' });
  }
  if (!['POST', 'PATCH', 'DELETE'].includes(req.method)) return reply(res, 501, { code: 'FIXTURE_UNSUPPORTED' });
  const id = /^eq\.([1-9]\d*)$/.exec(url.searchParams.get('id') || '')?.[1];
  if (req.method !== 'POST' && !id) invalid();
  const previous = id ? state.meals.get(id) : undefined;
  if (req.method !== 'POST' && !previous) return reply(res, 200, []);
  let result = previous;
  if (req.method !== 'DELETE') {
    const body = await readJson(req);
    const supplied = Array.isArray(body) && body.length === 1 ? body[0] : body;
    if (supplied?.user_id !== undefined && supplied.user_id !== userId) return reply(res, 403, { code: 'SYNTHETIC_USER_ONLY' });
    if (req.method === 'POST' && supplied?.user_id !== userId) invalid();
    if (supplied?.id !== undefined && !/^[1-9]\d{0,18}$/.test(String(supplied.id))) {
      return reply(res, 400, { code: '22P02', message: 'invalid input syntax for type bigint' });
    }
    result = validate(body, previous, state);
    if (req.method === 'POST' && state.meals.has(result.id)) return reply(res, 409, { code: '23505', message: 'Synthetic meal id already exists' });
    if (req.method === 'POST' && state.meals.size >= MAX_MEALS) return reply(res, 409, { code: 'FIXTURE_CAPACITY_REACHED' });
    state.meals.set(result.id, result);
  } else state.meals.delete(id);
  return reply(res, req.method === 'POST' ? 201 : 200, req.headers.prefer?.includes('return=representation') ? [result] : null);
}

module.exports = { handleMeals };
