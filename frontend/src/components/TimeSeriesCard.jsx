import React, { useMemo, useState } from 'react';
import { Box, Paper, Stack, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import { LineChart } from '@mui/x-charts/LineChart';
import { axisClasses } from '@mui/x-charts/ChartsAxis';

import { colors } from '../theme.js';

const hours = Array.from({ length: 24 }, (_, i) => i);
const chartColors = [colors.calm, colors.indigo, colors.teal, colors.coral];

function CandlestickChart({ candles }) {
  const width = 760;
  const height = 320;
  const margin = { top: 22, right: 24, bottom: 34, left: 52 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const values = candles.flatMap((candle) => [candle.high, candle.low]).filter(Number.isFinite);
  const maxValue = Math.max(...values, 1);
  const minValue = Math.min(...values, 0);
  const padding = Math.max((maxValue - minValue) * 0.12, 2);
  const yMax = maxValue + padding;
  const yMin = Math.max(0, minValue - padding);
  const yTicks = Array.from({ length: 5 }, (_, index) => yMin + ((yMax - yMin) * index) / 4);

  const xForHour = (hour) => margin.left + (plotWidth * (hour + 0.5)) / 24;
  const yForValue = (value) => margin.top + ((yMax - value) / (yMax - yMin || 1)) * plotHeight;

  return (
    <Box sx={{ width: '100%', overflowX: 'auto' }}>
      <Box
        component="svg"
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Hourly candlestick traffic duration chart"
        sx={{ display: 'block', minWidth: 680, width: '100%', height: 320 }}
      >
        {yTicks.map((tick) => {
          const y = yForValue(tick);
          return (
            <g key={tick}>
              <line
                x1={margin.left}
                x2={width - margin.right}
                y1={y}
                y2={y}
                stroke={colors.border}
                strokeDasharray="4 4"
              />
              <text x={margin.left - 10} y={y + 4} textAnchor="end" fontSize="11" fill={colors.muted}>
                {tick.toFixed(0)}
              </text>
            </g>
          );
        })}
        {hours.filter((hour) => hour % 3 === 0).map((hour) => (
          <text
            key={hour}
            x={xForHour(hour)}
            y={height - 10}
            textAnchor="middle"
            fontSize="11"
            fill={colors.muted}
          >
            {String(hour).padStart(2, '0')}:00
          </text>
        ))}
        <text
          x={16}
          y={margin.top + plotHeight / 2}
          transform={`rotate(-90 16 ${margin.top + plotHeight / 2})`}
          textAnchor="middle"
          fontSize="12"
          fill={colors.muted}
        >
          Traffic Duration (min)
        </text>
        {candles.map((candle) => {
          const x = xForHour(candle.hour);
          const highY = yForValue(candle.high);
          const lowY = yForValue(candle.low);
          const openY = yForValue(candle.open);
          const closeY = yForValue(candle.close);
          const bodyY = Math.min(openY, closeY);
          const bodyHeight = Math.max(Math.abs(openY - closeY), 3);
          const isWorse = candle.close >= candle.open;
          const candleColor = isWorse ? colors.crimson : colors.trafficClear;

          return (
            <g key={candle.hour}>
              <title>
                {`${String(candle.hour).padStart(2, '0')}:00 · Open ${candle.open.toFixed(1)}m · High ${candle.high.toFixed(1)}m · Low ${candle.low.toFixed(1)}m · Close ${candle.close.toFixed(1)}m`}
              </title>
              <line x1={x} x2={x} y1={highY} y2={lowY} stroke={candleColor} strokeWidth="2" />
              <rect
                x={x - 7}
                y={bodyY}
                width="14"
                height={bodyHeight}
                rx="2"
                fill={isWorse ? '#FEE2E2' : '#DCFCE7'}
                stroke={candleColor}
                strokeWidth="2"
              />
            </g>
          );
        })}
      </Box>
    </Box>
  );
}

export default function TimeSeriesCard({ records }) {
  const [chartMode, setChartMode] = useState('line');

  const { series, origins, candles } = useMemo(() => {
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

    const candleData = hours
      .map((hour) => {
        const matchingRecords = records
          .filter((row) => row.timestampDate && row.timestampDate.getHours() === hour)
          .sort((a, b) => a.timestampDate.getTime() - b.timestampDate.getTime());

        if (!matchingRecords.length) return null;

        const durationValues = matchingRecords.map((row) => row.live).filter(Number.isFinite);
        if (!durationValues.length) return null;

        return {
          hour,
          open: matchingRecords[0].live,
          high: Math.max(...durationValues),
          low: Math.min(...durationValues),
          close: matchingRecords[matchingRecords.length - 1].live
        };
      })
      .filter(Boolean);

    return { series: grouped, origins: originList, candles: candleData };
  }, [records]);

  const handleChartModeChange = (_event, nextMode) => {
    if (nextMode) setChartMode(nextMode);
  };

  return (
    <Paper sx={{ p: 3, height: '100%', minWidth: 0, overflow: 'hidden' }}>
      <Stack spacing={2} sx={{ minWidth: 0 }}>
        <Stack
          direction={{ xs: 'column', sm: 'row' }}
          spacing={1.5}
          alignItems={{ xs: 'flex-start', sm: 'center' }}
          justifyContent="space-between"
          sx={{ minWidth: 0 }}
        >
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2">Hourly Congestion Graph</Typography>
            <Typography variant="body2" color="text.secondary">
              {chartMode === 'line'
                ? 'Rush hours (08:00 & 17:00) peak in traffic duration from distinct origins.'
                : 'Hourly open, high, low, and close traffic duration across the current dataset.'}
            </Typography>
          </Box>
          <ToggleButtonGroup
            exclusive
            size="small"
            value={chartMode}
            onChange={handleChartModeChange}
            aria-label="Hourly congestion chart type"
            sx={{ flexShrink: 0 }}
          >
            <ToggleButton value="line">Line</ToggleButton>
            <ToggleButton value="candlestick">Candlestick</ToggleButton>
          </ToggleButtonGroup>
        </Stack>
        {origins.length === 0 ? (
          <Box sx={{ py: 8 }}>
            <Typography variant="body2" color="text.secondary" align="center">
              No time-series data available for the current filters.
            </Typography>
          </Box>
        ) : chartMode === 'candlestick' ? (
          <CandlestickChart candles={candles} />
        ) : (
          <Box sx={{ width: '100%', minWidth: 0, overflow: 'hidden' }}>
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
                minWidth: 0,
                [`& .${axisClasses.left} .${axisClasses.label}`]: {
                  transform: 'translate(-16px, 0)'
                }
              }}
            />
          </Box>
        )}
      </Stack>
    </Paper>
  );
}
