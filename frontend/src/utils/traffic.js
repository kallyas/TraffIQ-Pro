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
    'Base (min)',
    'Live (min)',
    'Delay (min)',
    'Status'
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
    row.status || getSeverityLabel(getSeverity(row.delay))
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

    if (filters.date) {
      const dateValue = row.timestampDate;
      if (!dateValue) return false;
      if (dateValue.toISOString().slice(0, 10) !== filters.date) return false;
    }

    if (filters.search) {
      const haystack = `${row.origin} ${row.destination} ${row.region} ${row.status}`.toLowerCase();
      if (!haystack.includes(filters.search.toLowerCase())) return false;
    }

    return true;
  });
}
