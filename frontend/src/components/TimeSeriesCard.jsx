import React, { useMemo } from 'react';
import { Box, Paper, Stack, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { axisClasses } from '@mui/x-charts/ChartsAxis';

import { colors } from '../theme.js';

const hours = Array.from({ length: 24 }, (_, i) => i);
const chartColors = [colors.calm, colors.indigo, colors.teal, colors.coral];

export default function TimeSeriesCard({ records }) {
  const { series, origins } = useMemo(() => {
    const originSet = new Set(records.map((row) => row.origin).filter(Boolean));
    const originList = Array.from(originSet);

    const grouped = originList.map((origin) => {
      const sums = Array(24).fill(0);
      const counts = Array(24).fill(0);

      records.forEach((row) => {
        if (row.origin !== origin) return;
        if (!row.timestampDate) return;
        const hour = row.timestampDate.getHours();
        sums[hour] += row.live;
        counts[hour] += 1;
      });

      const data = hours.map((hour) => (counts[hour] ? sums[hour] / counts[hour] : null));
      return { label: origin, data };
    });

    return { series: grouped, origins: originList };
  }, [records]);

  return (
    <Paper sx={{ p: 3, height: '100%' }}>
      <Stack spacing={2}>
        <Box>
          <Typography variant="subtitle2">Hourly Congestion Graph</Typography>
          <Typography variant="body2" color="text.secondary">
            Average traffic duration by hour with origin breakdown (rush hour peaks at 08:00 & 17:00).
          </Typography>
        </Box>
        {origins.length === 0 ? (
          <Box sx={{ py: 8 }}>
            <Typography variant="body2" color="text.secondary" align="center">
              No time-series data available for the current filters.
            </Typography>
          </Box>
        ) : (
          <LineChart
            height={320}
            xAxis={[
              {
                data: hours,
                scaleType: 'band',
                valueFormatter: (value) => `${String(value).padStart(2, '0')}:00`,
                tickLabelStyle: { fontSize: 12 }
              }
            ]}
            yAxis={[
              {
                label: 'Avg Traffic Duration (min)',
                tickLabelStyle: { fontSize: 12 }
              }
            ]}
            series={series.map((line, index) => ({
              ...line,
              curve: 'monotoneX',
              showMark: false,
              color: chartColors[index % chartColors.length]
            }))}
            grid={{ horizontal: true }}
            margin={{ top: 24, left: 48, right: 24, bottom: 32 }}
            slotProps={{
              legend: {
                direction: 'row',
                position: { vertical: 'bottom', horizontal: 'left' },
                itemMarkWidth: 10,
                itemMarkHeight: 10
              }
            }}
            sx={{
              [`& .${axisClasses.left} .${axisClasses.label}`]: {
                transform: 'translate(-16px, 0)'
              }
            }}
          />
        )}
      </Stack>
    </Paper>
  );
}
