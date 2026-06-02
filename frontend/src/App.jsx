import React, { useMemo, useState } from 'react';
import { Box, Container, Grid } from '@mui/material';

import AuditTableCard from './components/AuditTableCard.jsx';
import FiltersPanel from './components/FiltersPanel.jsx';
import HeaderBar from './components/HeaderBar.jsx';
import HeatmapCard from './components/HeatmapCard.jsx';
import KpiGrid from './components/KpiGrid.jsx';
import RouteMapCard from './components/RouteMapCard.jsx';
import TimeSeriesCard from './components/TimeSeriesCard.jsx';
import useTrafficData from './hooks/useTrafficData.js';
import { colors } from './theme.js';
import { buildTrafficQuery, computeKpis, filterRecords } from './utils/traffic.js';

const defaultFilters = {
  region: 'all',
  route: 'all',
  status: 'all',
  range: 'all',
  dateFrom: '',
  dateTo: '',
  search: ''
};

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
            <TimeSeriesCard records={recommendedRecords} />
          </Grid>
          <Grid item xs={12} lg={5}>
            <RouteMapCard records={filteredRecords} />
          </Grid>
        </Grid>

        <HeatmapCard records={recommendedRecords} />

        <AuditTableCard records={filteredRecords} totalCount={records.length} />
      </Container>
    </Box>
  );
}
