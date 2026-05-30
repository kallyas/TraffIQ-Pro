import React from 'react';
import { Grid, Paper, Stack, Typography } from '@mui/material';

import { colors } from '../theme.js';

const metrics = [
  { key: 'base', label: 'Standard Trip Duration', color: colors.slate },
  { key: 'live', label: 'Active Transit Duration', color: colors.slate },
  { key: 'delay', label: 'Avg Congestion Delay', color: colors.calm },
  { key: 'peak', label: 'Peak Delay Spike', color: colors.crimson }
];

export default function KpiGrid({ kpis }) {
  return (
    <Grid container spacing={3} sx={{ mb: 1 }}>
      {metrics.map((metric) => (
        <Grid item xs={12} sm={6} lg={3} key={metric.key}>
          <Paper sx={{ p: 3, height: '100%' }}>
            <Stack spacing={1}>
              <Typography variant="subtitle2">{metric.label}</Typography>
              <Typography variant="h4" sx={{ color: metric.color }}>
                {kpis[metric.key]}
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  min
                </Typography>
              </Typography>
            </Stack>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}
