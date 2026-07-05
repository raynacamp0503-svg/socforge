import { db } from './db.js';

// Maps SPL-style field names to event table columns.
const FIELD_MAP = {
  index: 'index_name', index_name: 'index_name',
  sourcetype: 'sourcetype',
  host: 'host',
  user: '"user"', username: '"user"', account: '"user"',
  src_ip: 'src_ip', source_ip: 'src_ip', src: 'src_ip',
  dest_ip: 'dest_ip', destination_ip: 'dest_ip', dest: 'dest_ip',
  eventcode: 'event_code', event_code: 'event_code', eventid: 'event_code', event_id: 'event_code',
  process_name: 'process_name', process: 'process_name', image: 'process_name',
  severity: 'severity',
  scenario: 'scenario_key', scenario_key: 'scenario_key',
};

export function parseQuery(q) {
  const tokens = (q || '').match(/(?:[^\s"]+="[^"]*"|"[^"]*"|\S)+/g) || [];
  const filters = [];
  const text = [];
  for (const t of tokens) {
    const m = t.match(/^([A-Za-z_][\w.]*)=(.*)$/);
    if (m) {
      filters.push({ field: m[1], value: m[2].replace(/^"|"$/g, '') });
    } else {
      text.push(t.replace(/^"|"$/g, ''));
    }
  }
  return { filters, text };
}

export function runSearch(q, { earliest, latest, limit = 500 } = {}) {
  const { filters, text } = parseQuery(q);
  const where = [];
  const params = [];

  if (earliest) { where.push('ts >= ?'); params.push(Number(earliest)); }
  if (latest) { where.push('ts <= ?'); params.push(Number(latest)); }

  for (const f of filters) {
    const col = FIELD_MAP[f.field.toLowerCase()];
    const val = f.value;
    if (!col) {
      // Unknown field: match against the extra JSON blob or message.
      where.push('(extra LIKE ? OR message LIKE ?)');
      const loose = `%${val.replaceAll('*', '%')}%`;
      params.push(loose, loose);
    } else if (val === '*') {
      where.push(`${col} IS NOT NULL AND ${col} != ''`);
    } else if (val.includes('*')) {
      where.push(`${col} LIKE ?`);
      params.push(val.replaceAll('*', '%'));
    } else {
      where.push(`LOWER(CAST(${col} AS TEXT)) = LOWER(?)`);
      params.push(val);
    }
  }

  for (const t of text) {
    where.push('(message LIKE ? OR process_name LIKE ? OR "user" LIKE ? OR host LIKE ?)');
    const like = `%${t}%`;
    params.push(like, like, like, like);
  }

  const sql = `SELECT * FROM events ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY ts DESC LIMIT ?`;
  params.push(Math.min(Number(limit) || 500, 2000));
  return db.prepare(sql).all(...params);
}
