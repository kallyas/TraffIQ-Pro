import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Toolbar,
  Tooltip,
  Typography
} from '@mui/material';
import L from 'leaflet';

import { colors } from './theme.js';

const AUTO_REFRESH_MS = 60000;
const API_URL = '/api/traffic';
const MAP_CENTER = [32.7886, -79.9835];

const defaultFilters = {
  region: 'all',
  route: 'all',
  status: 'all',
  date: '',
  search: ''
};

const syncStatusConfig = {
  live: { label: 'Live sync', color: colors.calm },
  syncing: { label: 'Syncing...', color: colors.coral },
  error: { label: 'Sync error', color: colors.crimson }
};

function formatDateTime(date) {
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function parseTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'number') return new Date(value);
  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return null;
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getSeverity(delay) {
  if (delay > 15) return 'heavy';
  if (delay > 5) return 'moderate';
  return 'normal';
}

function getSeverityLabel(severity) {
  if (severity === 'heavy') return 'Heavy';
  if (severity === 'moderate') return 'Moderate';
  return 'Normal';
}

function buildCsv(rows) {
  const header = ['Timestamp', 'Region', 'Origin', 'Destination', 'Distance (mi)', 'Base (min)', 'Live (min)', 'Delay (min)', 'Status'];
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

export default function App() {
  const [records, setRecords] = useState([]);
  const [filters, setFilters] = useState(defaultFilters);
  const [syncStatus, setSyncStatus] = useState('live');
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [isFetching, setIsFetching] = useState(false);

  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const routeLineRef = useRef(null);
  const markerOriginRef = useRef(null);
  const markerDestRef = useRef(null);

  const loadData = useCallback(async () => {
    if (isFetching) return;
    setIsFetching(true);
    setSyncStatus('syncing');
    try {
      const response = await fetch(API_URL);
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
          status: row.status || 'Normal'
        }))
        .sort((a, b) => (b.timestampDate?.getTime() || 0) - (a.timestampDate?.getTime() || 0));

      setRecords(normalized);
      setLastUpdated(new Date());
      setSyncStatus('live');
    } catch (error) {
      setSyncStatus('error');
    } finally {
      setIsFetching(false);
    }
  }, [isFetching]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = setInterval(loadData, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh, loadData]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomControl: false }).setView(MAP_CENTER, 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap CARTO'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    routeLineRef.current = L.polyline([], { color: colors.calm, weight: 5, opacity: 0.8 }).addTo(map);
    markerOriginRef.current = L.circleMarker([0, 0], {
      radius: 6,
      fillColor: colors.charcoal,
      color: '#FFFFFF',
      weight: 2,
      fillOpacity: 1
    }).addTo(map);
    markerDestRef.current = L.circleMarker([0, 0], {
      radius: 6,
      fillColor: colors.charcoal,
      color: '#FFFFFF',
      weight: 2,
      fillOpacity: 1
    }).addTo(map);

    mapInstance.current = map;
  }, []);

  const filteredRecords = useMemo(() => {
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
  }, [filters, records]);

  useEffect(() => {
    const map = mapInstance.current;
    const routeLine = routeLineRef.current;
    const markerOrigin = markerOriginRef.current;
    const markerDest = markerDestRef.current;

    if (!map || !routeLine || !markerOrigin || !markerDest) return;

    if (!filteredRecords.length) {
      routeLine.setLatLngs([]);
      return;
    }

    const latest = filteredRecords[0];
    if (![latest.originLat, latest.originLng, latest.destLat, latest.destLng].every(Number.isFinite)) {
      return;
    }

    const originCoords = [latest.originLat, latest.originLng];
    const destCoords = [latest.destLat, latest.destLng];

    routeLine.setLatLngs([originCoords, destCoords]);
    markerOrigin.setLatLng(originCoords).bindPopup(`<b>${latest.origin} Base Hub</b>`);
    markerDest.setLatLng(destCoords).bindPopup(`<b>${latest.destination} Depot Node</b>`);

    if (latest.delay > 15) {
      routeLine.setStyle({ color: colors.crimson, weight: 8 });
    } else if (latest.delay > 5) {
      routeLine.setStyle({ color: colors.coral, weight: 6 });
    } else {
      routeLine.setStyle({ color: colors.calm, weight: 5 });
    }

    map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
  }, [filteredRecords]);

  const routeOptions = useMemo(() => {
    const set = new Set(records.map((row) => `${row.origin} → ${row.destination}`).filter(Boolean));
    return ['all', ...set];
  }, [records]);

  const regionOptions = useMemo(() => {
    const set = new Set(records.map((row) => row.region).filter(Boolean));
    return ['all', ...set];
  }, [records]);

  const kpis = useMemo(() => {
    if (!filteredRecords.length) {
      return {
        base: '--',
        live: '--',
        delay: '--',
        peak: '--'
      };
    }

    const base = filteredRecords.reduce((acc, row) => acc + row.base, 0) / filteredRecords.length;
    const live = filteredRecords.reduce((acc, row) => acc + row.live, 0) / filteredRecords.length;
    const delay = filteredRecords.reduce((acc, row) => acc + row.delay, 0) / filteredRecords.length;
    const peak = Math.max(...filteredRecords.map((row) => row.delay));

    return {
      base: base.toFixed(1),
      live: live.toFixed(1),
      delay: delay.toFixed(1),
      peak: peak.toFixed(1)
    };
  }, [filteredRecords]);

  const heatmapRows = useMemo(() => {
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return daysOfWeek.map((day, dayIndex) => {
      const cells = Array.from({ length: 24 }).map((_, hour) => {
        const matchingRecords = filteredRecords.filter((row) => {
          const dateObj = row.timestampDate;
          if (!dateObj) return false;
          const normalizedDay = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;
          return normalizedDay === dayIndex && dateObj.getHours() === hour;
        });

        let cellColor = '#F9F5F0';
        let calculatedDelay = 0;

        if (matchingRecords.length > 0) {
          calculatedDelay =
            matchingRecords.reduce((sum, row) => sum + row.delay, 0) / matchingRecords.length;
          if (calculatedDelay > 15) cellColor = colors.crimson;
          else if (calculatedDelay > 5) cellColor = colors.coral;
          else if (calculatedDelay > 0.5) cellColor = '#BDC3C7';
        }

        return {
          hour,
          cellColor,
          calculatedDelay
        };
      });

      return { day, dayIndex, cells };
    });
  }, [filteredRecords]);

  const handleFilterChange = (key) => (event) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const clearFilters = () => setFilters(defaultFilters);

  const handleDownload = () => {
    if (!filteredRecords.length) return;
    const csvContent = buildCsv(filteredRecords);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `traffiq-audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const statusChip = (delay, label) => {
    const severity = getSeverity(delay);
    const palette =
      severity === 'heavy'
        ? { background: '#FDECEA', color: colors.crimson }
        : severity === 'moderate'
          ? { background: '#FFF4E5', color: colors.coral }
          : { background: '#EAF4FF', color: colors.calm };

    return (
      <Chip
        label={label || getSeverityLabel(severity)}
        size="small"
        sx={{ bgcolor: palette.background, color: palette.color, fontWeight: 600 }}
      />
    );
  };

  const syncStatusMeta = syncStatusConfig[syncStatus] || syncStatusConfig.live;

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: colors.bg }}>
      <AppBar position="static" elevation={2}>
        <Toolbar sx={{ py: 2 }}>
          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={3}
            sx={{ width: '100%', justifyContent: 'space-between' }}
          >
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip label="PRO" size="small" sx={{ bgcolor: colors.calm, color: '#fff' }} />
              <Box>
                <Typography variant="h6" sx={{ fontWeight: 600 }}>
                  TraffIQ-Pro
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Traffic Monitoring &amp; Reporting System
                </Typography>
              </Box>
            </Stack>

            <Stack
              direction={{ xs: 'column', sm: 'row' }}
              spacing={2}
              alignItems={{ xs: 'flex-start', sm: 'center' }}
            >
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1,
                  px: 2,
                  py: 0.5,
                  bgcolor: 'rgba(255,255,255,0.12)',
                  borderRadius: 999
                }}
              >
                <Box
                  sx={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    bgcolor: syncStatusMeta.color
                  }}
                />
                <Typography variant="caption">{syncStatusMeta.label}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary">
                Last synced: {lastUpdated ? formatDateTime(lastUpdated) : '--'}
              </Typography>
              <Button
                variant="contained"
                onClick={loadData}
                disabled={isFetching}
                sx={{ bgcolor: colors.slate, '&:hover': { bgcolor: '#243342' } }}
              >
                Refresh
              </Button>
              <FormControlLabel
                control={
                  <Switch
                    checked={autoRefresh}
                    onChange={(event) => setAutoRefresh(event.target.checked)}
                    color="secondary"
                  />
                }
                label={<Typography variant="caption">Auto-refresh</Typography>}
              />
            </Stack>
          </Stack>
        </Toolbar>

        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)' }} />

        <Toolbar sx={{ py: 2 }}>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6} md={3} lg={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Region</InputLabel>
                <Select
                  label="Region"
                  value={filters.region}
                  onChange={handleFilterChange('region')}
                >
                  {regionOptions.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option === 'all' ? 'All Regions' : option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3} lg={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Route</InputLabel>
                <Select label="Route" value={filters.route} onChange={handleFilterChange('route')}>
                  {routeOptions.map((option) => (
                    <MenuItem key={option} value={option}>
                      {option === 'all' ? 'All Routes' : option}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6} md={3} lg={2}>
              <TextField
                fullWidth
                size="small"
                label="Date"
                type="date"
                value={filters.date}
                onChange={handleFilterChange('date')}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={3} lg={2}>
              <FormControl fullWidth size="small">
                <InputLabel>Status</InputLabel>
                <Select
                  label="Status"
                  value={filters.status}
                  onChange={handleFilterChange('status')}
                >
                  <MenuItem value="all">All Status</MenuItem>
                  <MenuItem value="normal">Normal</MenuItem>
                  <MenuItem value="moderate">Moderate</MenuItem>
                  <MenuItem value="heavy">Heavy</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={6} lg={3}>
              <TextField
                fullWidth
                size="small"
                label="Search"
                placeholder="Search origin, destination, region..."
                value={filters.search}
                onChange={handleFilterChange('search')}
              />
            </Grid>
            <Grid item xs={12} md={3} lg={1}>
              <Button
                fullWidth
                variant="outlined"
                onClick={clearFilters}
                sx={{ height: '100%' }}
              >
                Clear
              </Button>
            </Grid>
          </Grid>
        </Toolbar>
      </AppBar>

      <Box sx={{ maxWidth: 1400, mx: 'auto', px: 3, py: 4 }}>
        <Grid container spacing={3}>
          {[
            { label: 'Standard Trip Duration', value: kpis.base, color: colors.charcoal },
            { label: 'Active Transit Duration', value: kpis.live, color: colors.charcoal },
            { label: 'Avg Congestion Delay', value: kpis.delay, color: colors.calm },
            { label: 'Peak Delay Spike', value: kpis.peak, color: colors.crimson }
          ].map((card) => (
            <Grid item xs={12} sm={6} lg={3} key={card.label}>
              <Paper sx={{ p: 3, height: '100%' }}>
                <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600 }}>
                  {card.label.toUpperCase()}
                </Typography>
                <Typography variant="h4" sx={{ fontWeight: 700, mt: 1, color: card.color }}>
                  {card.value}
                  <Typography component="span" variant="caption" color="text.secondary" sx={{ ml: 1 }}>
                    min
                  </Typography>
                </Typography>
              </Paper>
            </Grid>
          ))}
        </Grid>

        <Grid container spacing={3} sx={{ mt: 1 }}>
          <Grid item xs={12} lg={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Real-Time Route Corridor Performance
                </Typography>
                <Stack direction="row" spacing={2} alignItems="center">
                  <Chip label="Normal" size="small" sx={{ bgcolor: '#EAF4FF', color: colors.calm }} />
                  <Chip label="Moderate" size="small" sx={{ bgcolor: '#FFF4E5', color: colors.coral }} />
                  <Chip label="Heavy" size="small" sx={{ bgcolor: '#FDECEA', color: colors.crimson }} />
                </Stack>
                <Box
                  ref={mapRef}
                  sx={{
                    height: { xs: 320, md: 400 },
                    borderRadius: 2,
                    overflow: 'hidden',
                    bgcolor: '#F9FAFB'
                  }}
                />
              </Stack>
            </Paper>
          </Grid>
          <Grid item xs={12} lg={6}>
            <Paper sx={{ p: 3, height: '100%' }}>
              <Stack spacing={2}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  Hourly Congestion Heatmap Matrix (Day vs. Hour)
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Hover on a cell for average delay details.
                </Typography>
                <Box>
                  <Stack direction="row" justifyContent="space-between" sx={{ px: 5, mb: 1 }}>
                    {['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'].map((label) => (
                      <Typography key={label} variant="caption" color="text.secondary">
                        {label}
                      </Typography>
                    ))}
                  </Stack>
                  <Stack spacing={1}>
                    {heatmapRows.map((row) => (
                      <Stack key={row.day} direction="row" spacing={1} alignItems="center">
                        <Typography variant="caption" color="text.secondary" sx={{ width: 32 }}>
                          {row.day}
                        </Typography>
                        <Box
                          sx={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(24, minmax(0, 1fr))',
                            gap: 0.5,
                            flexGrow: 1
                          }}
                        >
                          {row.cells.map((cell) => (
                            <Tooltip
                              key={`${row.day}-${cell.hour}`}
                              title={`${row.day} ${String(cell.hour).padStart(2, '0')}:00 · Avg Delay ${cell.calculatedDelay.toFixed(1)}m`}
                              arrow
                            >
                              <Box
                                sx={{
                                  height: 14,
                                  borderRadius: 0.5,
                                  bgcolor: cell.cellColor,
                                  transition: 'transform 150ms ease',
                                  '&:hover': { transform: 'scale(1.2)' }
                                }}
                              />
                            </Tooltip>
                          ))}
                        </Box>
                      </Stack>
                    ))}
                  </Stack>
                </Box>
                <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
                  <Typography variant="caption" color="text.secondary">
                    Smooth
                  </Typography>
                  <Box
                    sx={{
                      width: 120,
                      height: 12,
                      borderRadius: 999,
                      background: `linear-gradient(90deg, #F9F5F0, ${colors.coral}, ${colors.crimson})`
                    }}
                  />
                  <Typography variant="caption" color="text.secondary">
                    Heavy Delay
                  </Typography>
                </Stack>
              </Stack>
            </Paper>
          </Grid>
        </Grid>

        <Paper sx={{ p: 0, mt: 4, overflow: 'hidden' }}>
          <Box
            sx={{
              px: 3,
              py: 2,
              borderBottom: `1px solid ${colors.border}`,
              bgcolor: '#F9FAFB',
              display: 'flex',
              flexWrap: 'wrap',
              gap: 2,
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <Box>
              <Typography variant="subtitle2" sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                Real-Time Traffic Audit Log
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Includes live updates and applied filters.
              </Typography>
            </Box>
            <Stack direction="row" spacing={2} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Showing {filteredRecords.length} of {records.length} records
              </Typography>
              <Button variant="contained" onClick={handleDownload} disabled={!filteredRecords.length}>
                Download CSV
              </Button>
            </Stack>
          </Box>
          <TableContainer sx={{ maxHeight: 520 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {[
                    'Timestamp',
                    'Region',
                    'Origin',
                    'Destination',
                    'Distance',
                    'Base Time',
                    'Live Time',
                    'Delay',
                    'Status'
                  ].map((header) => (
                    <TableCell key={header} sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                      {header}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {filteredRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 6 }}>
                      <Typography variant="body2" color="text.secondary">
                        No records match the current filter configuration criteria.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRecords.map((record, index) => (
                    <TableRow key={`${record.timestamp}-${index}`} hover>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {record.timestamp}
                      </TableCell>
                      <TableCell sx={{ fontSize: 12, color: colors.muted }}>{record.region}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{record.origin}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{record.destination}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {record.distance ? `${record.distance.toFixed(1)} mi` : '--'}
                      </TableCell>
                      <TableCell sx={{ color: colors.muted }}>{record.base.toFixed(1)}m</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{record.live.toFixed(1)}m</TableCell>
                      <TableCell
                        sx={{
                          fontFamily: 'monospace',
                          color: record.delay > 5 ? colors.crimson : colors.muted,
                          fontWeight: record.delay > 5 ? 700 : 400
                        }}
                      >
                        {record.delay.toFixed(1)}m
                      </TableCell>
                      <TableCell>{statusChip(record.delay, record.status)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Box>
    </Box>
  );
}
