import React from 'react';
import {
  Box,
  Button,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Typography
} from '@mui/material';

import { colors } from '../theme.js';

export default function FiltersPanel({
  filters,
  regionOptions,
  routeOptions,
  onFilterChange,
  onClear
}) {
  return (
    <Paper sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle1">Live Filters</Typography>
          <Typography variant="body2" color="text.secondary">
            Refine the dashboard to focus on the corridor, time window, and congestion tier.
          </Typography>
        </Box>
        <Grid container spacing={2}>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Region</InputLabel>
              <Select label="Region" value={filters.region} onChange={onFilterChange('region')}>
                {regionOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option === 'all' ? 'All Regions' : option}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel>Route</InputLabel>
              <Select label="Route" value={filters.route} onChange={onFilterChange('route')}>
                {routeOptions.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option === 'all' ? 'All Routes' : option}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <TextField
              fullWidth
              size="small"
              label="Date"
              type="date"
              value={filters.date}
              onChange={onFilterChange('date')}
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={6} md={2}>
            <FormControl fullWidth size="small">
              <InputLabel>Status</InputLabel>
              <Select label="Status" value={filters.status} onChange={onFilterChange('status')}>
                <MenuItem value="all">All Status</MenuItem>
                <MenuItem value="normal">Normal</MenuItem>
                <MenuItem value="moderate">Moderate</MenuItem>
                <MenuItem value="heavy">Heavy</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6} lg={4}>
            <TextField
              fullWidth
              size="small"
              label="Search"
              placeholder="Search origin, destination, region..."
              value={filters.search}
              onChange={onFilterChange('search')}
            />
          </Grid>
          <Grid item xs={12} md={3} lg={2}>
            <Button
              fullWidth
              variant="outlined"
              onClick={onClear}
              sx={{ height: '100%', borderColor: colors.border }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Stack>
    </Paper>
  );
}
