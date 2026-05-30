import React, { useMemo } from 'react';
import { Box, Paper, Stack, Tooltip, Typography } from '@mui/material';

import { colors } from '../theme.js';

export default function HeatmapCard({ records }) {
  const heatmapRows = useMemo(() => {
    const daysOfWeek = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return daysOfWeek.map((day, dayIndex) => {
      const cells = Array.from({ length: 24 }).map((_, hour) => {
        const matchingRecords = records.filter((row) => {
          const dateObj = row.timestampDate;
          if (!dateObj) return false;
          const normalizedDay = dateObj.getDay() === 0 ? 6 : dateObj.getDay() - 1;
          return normalizedDay === dayIndex && dateObj.getHours() === hour;
        });

        let cellColor = '#F3F4F6';
        let calculatedDelay = 0;

        if (matchingRecords.length > 0) {
          calculatedDelay =
            matchingRecords.reduce((sum, row) => sum + row.delay, 0) / matchingRecords.length;
          if (calculatedDelay > 15) cellColor = colors.crimson;
          else if (calculatedDelay > 5) cellColor = colors.coral;
          else if (calculatedDelay > 0.5) cellColor = '#94A3B8';
        }

        return {
          hour,
          cellColor,
          calculatedDelay
        };
      });

      return { day, dayIndex, cells };
    });
  }, [records]);

  return (
    <Paper sx={{ p: 3, mt: 3 }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2">Hourly Congestion Heatmap</Typography>
          <Typography variant="body2" color="text.secondary">
            Day-by-hour delay intensity across the filtered dataset.
          </Typography>
        </Box>
        <Box>
          {records.length === 0 ? (
            <Box sx={{ py: 6 }}>
              <Typography variant="body2" color="text.secondary" align="center">
                No heatmap data available for the current filters.
              </Typography>
            </Box>
          ) : (
            <>
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
            </>
          )}
        </Box>
        <Stack direction="row" spacing={1} justifyContent="flex-end" alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Smooth
          </Typography>
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Box sx={{ width: 34, height: 10, borderRadius: 6, bgcolor: '#F3F4F6' }} />
            <Box sx={{ width: 34, height: 10, borderRadius: 6, bgcolor: colors.coral }} />
            <Box sx={{ width: 34, height: 10, borderRadius: 6, bgcolor: colors.crimson }} />
          </Stack>
          <Typography variant="caption" color="text.secondary">
            Heavy Delay
          </Typography>
        </Stack>
      </Stack>
    </Paper>
  );
}
