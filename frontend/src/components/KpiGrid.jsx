import React from 'react';
import { Grid, Paper, Stack, Typography } from '@mui/material';

import { colors } from '../theme.js';

const metrics = [
  { key: 'base', label: 'Free-Flow Time', hint: 'No-traffic baseline', color: colors.slate },
  { key: 'live', label: 'Traffic-Adjusted Time', hint: 'Live Google estimate', color: colors.indigo },
  { key: 'delay', label: 'Avg Delay', hint: 'Live vs free-flow', color: colors.calm },
  { key: 'peak', label: 'Peak Delay', hint: 'Worst sample in view', color: colors.crimson }
];

export default function KpiGrid({ kpis }) {
  return (
    <Grid container spacing={3} sx={{ mb: 1 }}>
      {metrics.map((metric) => (
        <Grid item xs={12} sm={6} lg={3} key={metric.key}>
          <Paper
            sx={{
              p: 3,
              height: '100%',
              position: 'relative',
              overflow: 'hidden',
              '&::before': {
                content: '""',
                position: 'absolute',
                top: 0,
                left: 0,
                width: 4,
                height: '100%',
                bgcolor: metric.color
              }
            }}
          >
            <Stack spacing={0.5}>
              <Typography variant="subtitle2">{metric.label}</Typography>
              <Typography variant="h4" sx={{ color: metric.color }}>
                {kpis[metric.key]}
                <Typography component="span" variant="body2" color="text.secondary" sx={{ ml: 1 }}>
                  min
                </Typography>
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {metric.hint}
              </Typography>
            </Stack>
          </Paper>
        </Grid>
      ))}
    </Grid>
  );
}
