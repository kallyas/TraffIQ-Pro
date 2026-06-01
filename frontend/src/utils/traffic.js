export function getSeverity(delay) {
  if (delay > 15) return 'heavy';
  if (delay > 5) return 'moderate';
  return 'normal';
}

export function getSeverityLabel(severity) {
  if (severity === 'heavy') return 'Heavy';
  if (severity === 'moderate') return 'Moderate';
  return 'Normal';
}

export function buildCsv(rows) {
  const header = [
    'Timestamp',
    'Region',
    'Origin',
    'Destination',
    'Distance (mi)',
    'Normal Drive Time (min)',
    'Traffic-Adjusted Time (min)',
    'Delay (min)',
    'Status',
    'Route',
    'Notes'
  ];
  const body = rows.map((row) => [
    row.timestamp,
    row.region,
    row.origin,
    row.destination,
    row.distance ? row.distance.toFixed(1) : '',
    row.base.toFixed(1),
    row.live.toFixed(1),
    row.delay.toFixed(1),
    row.status || getSeverityLabel(getSeverity(row.delay)),
    row.route || '',
    row.notes || ''
  ]);

  return [header, ...body]
    .map((values) => values.map((value) => `"${String(value ?? '').replace(/"/g, '""')}"`).join(','))
    .join('\n');
}

export function computeKpis(records) {
  if (!records.length) {
    return {
      base: '--',
      live: '--',
      delay: '--',
      peak: '--'
    };
  }

  const base = records.reduce((acc, row) => acc + row.base, 0) / records.length;
  const live = records.reduce((acc, row) => acc + row.live, 0) / records.length;
  const delay = records.reduce((acc, row) => acc + row.delay, 0) / records.length;
  const peak = Math.max(...records.map((row) => row.delay));

  return {
    base: base.toFixed(1),
    live: live.toFixed(1),
    delay: delay.toFixed(1),
    peak: peak.toFixed(1)
  };
}

/**
 * Build the query string for the traffic API from the active date range.
 * Presets map to a rolling `days` window; "custom" maps to explicit from/to.
 * The server applies the same window so large sheets aren't shipped wholesale.
 */
export function buildTrafficQuery(filters) {
  const params = new URLSearchParams();
  if (filters.range && filters.range !== 'all') {
    if (filters.range === 'custom') {
      if (filters.dateFrom) params.set('from', filters.dateFrom);
      if (filters.dateTo) params.set('to', filters.dateTo);
    } else {
      params.set('days', filters.range);
    }
  }
  return params.toString();
}

export function filterRecords(records, filters) {
  return records.filter((row) => {
    if (filters.region !== 'all' && !row.region.toLowerCase().includes(filters.region.toLowerCase())) {
      return false;
    }

    if (filters.route !== 'all' && `${row.origin} → ${row.destination}` !== filters.route) {
      return false;
    }

    if (filters.status !== 'all' && getSeverity(row.delay) !== filters.status) {
      return false;
    }

    // The server already windows by range; this is a defensive client-side
    // guard for custom from/to so the view stays correct between refetches.
    if (filters.range === 'custom') {
      const dateValue = row.timestampDate;
      if (filters.dateFrom) {
        if (!dateValue || dateValue < new Date(`${filters.dateFrom}T00:00:00`)) return false;
      }
      if (filters.dateTo) {
        if (!dateValue || dateValue > new Date(`${filters.dateTo}T23:59:59.999`)) return false;
      }
    }

    if (filters.search) {
      const haystack = `${row.origin} ${row.destination} ${row.region} ${row.status}`.toLowerCase();
      if (!haystack.includes(filters.search.toLowerCase())) return false;
    }

    return true;
  });
}
