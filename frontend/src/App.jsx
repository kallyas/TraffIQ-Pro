import React, { Suspense, lazy, useMemo, useState } from 'react';
import { Box, Container, Grid, Paper, Skeleton } from '@mui/material';

import FiltersPanel from './components/FiltersPanel.jsx';
import HeaderBar from './components/HeaderBar.jsx';
import KpiGrid from './components/KpiGrid.jsx';
import useTrafficData from './hooks/useTrafficData.js';
import { colors } from './theme.js';
import { buildTrafficQuery, computeKpis, filterRecords } from './utils/traffic.js';

const AuditTableCard = lazy(() => import('./components/AuditTableCard.jsx'));
const HeatmapCard = lazy(() => import('./components/HeatmapCard.jsx'));
const RouteMapCard = lazy(() => import('./components/RouteMapCard.jsx'));
const TimeSeriesCard = lazy(() => import('./components/TimeSeriesCard.jsx'));

const defaultFilters = {
  region: 'all',
  route: 'all',
  status: 'all',
  range: 'all',
  dateFrom: '',
  dateTo: '',
  search: ''
};

function PanelSkeleton({ height = 320, mt = 0 }) {
  return (
    <Paper sx={{ p: 3, mt, height: '100%' }}>
      <Skeleton variant="text" width={180} height={24} />
      <Skeleton variant="text" width="55%" height={20} />
      <Skeleton variant="rounded" height={height} sx={{ mt: 2 }} />
    </Paper>
  );
}

export default function App() {
  const [filters, setFilters] = useState(defaultFilters);

  const dataQuery = useMemo(
    () => buildTrafficQuery(filters),
    [filters.range, filters.dateFrom, filters.dateTo]
  );

  const {
    records,
    syncStatus,
    autoRefresh,
    lastUpdated,
    isFetching,
    loadData,
    setAutoRefresh
  } = useTrafficData(dataQuery);

  const filteredRecords = useMemo(() => filterRecords(records, filters), [records, filters]);

  // Aggregate views reflect the route the shuttle would actually take (the
  // recommended/fastest corridor); the map and audit log still show every option.
  const recommendedRecords = useMemo(() => {
    const recommended = filteredRecords.filter((row) => row.recommended);
    return recommended.length ? recommended : filteredRecords;
  }, [filteredRecords]);

  const routeOptions = useMemo(() => {
    const set = new Set(records.map((row) => `${row.origin} → ${row.destination}`).filter(Boolean));
    return ['all', ...set];
  }, [records]);

  const regionOptions = useMemo(() => {
    const set = new Set(records.map((row) => row.region).filter(Boolean));
    return ['all', ...set];
  }, [records]);

  const kpis = useMemo(() => computeKpis(recommendedRecords), [recommendedRecords]);

  const handleFilterChange = (key) => (event) => {
    setFilters((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const clearFilters = () => setFilters(defaultFilters);

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: colors.bg }}>
      <HeaderBar
        syncStatus={syncStatus}
        lastUpdated={lastUpdated}
        autoRefresh={autoRefresh}
        isFetching={isFetching}
        onRefresh={loadData}
        onToggleAutoRefresh={setAutoRefresh}
      />

      <Container maxWidth="xl" sx={{ mt: 4, pb: 6 }}>
        <FiltersPanel
          filters={filters}
          regionOptions={regionOptions}
          routeOptions={routeOptions}
          onFilterChange={handleFilterChange}
          onClear={clearFilters}
        />

        <KpiGrid kpis={kpis} />

        <Grid container spacing={3}>
          <Grid item xs={12} lg={7}>
            <Suspense fallback={<PanelSkeleton />}>
              <TimeSeriesCard records={recommendedRecords} />
            </Suspense>
          </Grid>
          <Grid item xs={12} lg={5}>
            <Suspense fallback={<PanelSkeleton height={440} />}>
              <RouteMapCard records={filteredRecords} />
            </Suspense>
          </Grid>
        </Grid>

        <Suspense fallback={<PanelSkeleton height={180} mt={3} />}>
          <HeatmapCard records={recommendedRecords} />
        </Suspense>

        <Suspense fallback={<PanelSkeleton height={360} mt={4} />}>
          <AuditTableCard records={filteredRecords} totalCount={records.length} />
        </Suspense>
      </Container>
    </Box>
  );
}
