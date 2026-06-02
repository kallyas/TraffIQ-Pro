import { useCallback, useEffect, useRef, useState } from 'react';

import { parseTimestamp, toNumber } from '../utils/format.js';

const AUTO_REFRESH_MS = 60000;
const API_URL = '/api/traffic';

export default function useTrafficData(query = '') {
  const [records, setRecords] = useState([]);
  const [syncStatus, setSyncStatus] = useState('live');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const inFlightRef = useRef(false);

  const loadData = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setIsFetching(true);
    setSyncStatus('syncing');
    try {
      const response = await fetch(query ? `${API_URL}?${query}` : API_URL);
      if (!response.ok) {
        throw new Error('Failed to fetch traffic data.');
      }
      const payload = await response.json();
      const rows = Array.isArray(payload?.data) ? payload.data : [];

      const normalized = rows
        .map((row) => ({
          timestamp: row.timestamp || '',
          timestampDate: parseTimestamp(row.timestamp),
          region: row.region || '',
          origin: row.origin || '',
          destination: row.destination || '',
          originLat: toNumber(row.originLat),
          originLng: toNumber(row.originLng),
          destLat: toNumber(row.destLat),
          destLng: toNumber(row.destLng),
          distance: toNumber(row.distance),
          base: toNumber(row.base),
          live: toNumber(row.live),
          delay: toNumber(row.delay),
          status: row.status || 'Normal',
          route: row.route || '',
          recommended: Boolean(row.recommended),
          notes: row.notes || '',
          polyline: row.polyline || ''
        }))
        .sort((a, b) => (b.timestampDate?.getTime() || 0) - (a.timestampDate?.getTime() || 0));

      setRecords(normalized);
      setLastUpdated(new Date());
      setSyncStatus('live');
    } catch (error) {
      setSyncStatus('error');
    } finally {
      inFlightRef.current = false;
      setIsFetching(false);
    }
  }, [query]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(loadData, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, loadData]);

  return {
    records,
    syncStatus,
    autoRefresh,
    lastUpdated,
    isFetching,
    loadData,
    setAutoRefresh
  };
}
