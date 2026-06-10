import { google } from 'googleapis';

const HEADER_MAP = {
  'timestamp': 'timestamp',
  'region': 'region',
  'origin': 'origin',
  'destination': 'destination',
  'origin lat': 'originLat',
  'origin lng': 'originLng',
  'dest lat': 'destLat',
  'dest lng': 'destLng',
  'distance (mi)': 'distance',
  'normal duration (min)': 'base',
  'traffic duration (min)': 'live',
  'delay (min)': 'delay',
  'status': 'status',
  'route': 'route',
  'recommended': 'recommended',
  'notes': 'notes',
  'polyline': 'polyline'
};

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets.readonly'];

function toNumber(value) {
  if (value === null || value === undefined || value === '') return 0;
  const parsed = Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeHeader(header) {
  return String(header || '').trim().toLowerCase();
}

function parseRowDate(timestamp) {
  if (!timestamp) return null;
  // Sheet timestamps are "YYYY-MM-DD HH:MM:SS"; normalize to ISO-ish for Date().
  const parsed = new Date(String(timestamp).replace(' ', 'T'));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function normalizeRouteLabel(route) {
  const value = String(route || '').trim();
  if (/^(sc-?61|route 61)/i.test(value)) return 'Route 61';
  if (/^(us-?17|route 17)/i.test(value)) return 'Route 17';
  return value;
}

/**
 * Restrict rows by a rolling window (`days`) or an explicit `from`/`to` range.
 * `from`/`to` take precedence when present. Invalid/absent params return all rows.
 */
function applyDateWindow(data, query) {
  const { days, from, to } = query || {};

  if (from || to) {
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity;
    return data.filter((row) => {
      const date = parseRowDate(row.timestamp);
      return date && date.getTime() >= fromMs && date.getTime() <= toMs;
    });
  }

  const dayCount = Number(days);
  if (Number.isFinite(dayCount) && dayCount > 0) {
    const cutoff = Date.now() - dayCount * 24 * 60 * 60 * 1000;
    return data.filter((row) => {
      const date = parseRowDate(row.timestamp);
      return date && date.getTime() >= cutoff;
    });
  }

  return data;
}

function getCredentials() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_JSON environment variable.');
  }
  const trimmed = raw.trim();
  const jsonString = trimmed.startsWith('{')
    ? trimmed
    : Buffer.from(trimmed.replace(/\s+/g, ''), 'base64').toString('utf8');
  const parsed = JSON.parse(jsonString);
  if (parsed.private_key) {
    parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
  }
  return parsed;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  try {
    const spreadsheetId = process.env.SPREADSHEET_ID;
    const worksheetName = process.env.WORKSHEET_NAME || 'Log';

    if (!spreadsheetId) {
      res.status(500).json({ error: 'Missing SPREADSHEET_ID environment variable.' });
      return;
    }

    const auth = new google.auth.GoogleAuth({
      credentials: getCredentials(),
      scopes: SCOPES
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const range = `'${worksheetName}'!A1:Q`;
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range
    });

    const rows = response.data.values || [];
    if (rows.length === 0) {
      res.status(200).json({ data: [] });
      return;
    }

    const headers = rows[0] || [];
    const headerIndex = headers.reduce((acc, header, index) => {
      const normalized = normalizeHeader(header);
      const key = HEADER_MAP[normalized];
      if (key) {
        acc[key] = index;
      }
      return acc;
    }, {});

    const data = rows.slice(1).map((row) => ({
      timestamp: row[headerIndex.timestamp] || '',
      region: row[headerIndex.region] || '',
      origin: row[headerIndex.origin] || '',
      destination: row[headerIndex.destination] || '',
      originLat: toNumber(row[headerIndex.originLat]),
      originLng: toNumber(row[headerIndex.originLng]),
      destLat: toNumber(row[headerIndex.destLat]),
      destLng: toNumber(row[headerIndex.destLng]),
      distance: toNumber(row[headerIndex.distance]),
      base: toNumber(row[headerIndex.base]),
      live: toNumber(row[headerIndex.live]),
      delay: toNumber(row[headerIndex.delay]),
      status: row[headerIndex.status] || 'Normal',
      route: normalizeRouteLabel(row[headerIndex.route]),
      recommended: /^(yes|true|1)$/i.test(String(row[headerIndex.recommended] || '').trim()),
      notes: row[headerIndex.notes] || '',
      polyline: row[headerIndex.polyline] || ''
    }));

    const windowed = applyDateWindow(data, req.query);

    res.setHeader('Cache-Control', 's-maxage=30, stale-while-revalidate=60');
    res.status(200).json({ data: windowed });
  } catch (error) {
    res.status(500).json({ error: error.message || 'Failed to load sheet data.' });
  }
}
