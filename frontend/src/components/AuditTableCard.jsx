import React from 'react';
import {
  Box,
  Button,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography
} from '@mui/material';

import { colors } from '../theme.js';
import { buildCsv, getSeverity, getSeverityLabel } from '../utils/traffic.js';

export default function AuditTableCard({ records, totalCount }) {
  const handleDownload = () => {
    if (!records.length) return;
    const csvContent = buildCsv(records);
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

  return (
    <Paper sx={{ mt: 4, overflow: 'hidden' }}>
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
          <Typography variant="subtitle2">Real-Time Traffic Audit Log</Typography>
          <Typography variant="body2" color="text.secondary">
            Live entries aligned with the active filters.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <Typography variant="caption" color="text.secondary">
            Showing {records.length} of {totalCount} records
          </Typography>
          <Button variant="contained" onClick={handleDownload} disabled={!records.length}>
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
                'Normal Time',
                'Traffic Time',
                'Delay',
                'Status',
                'Route',
                'Notes'
              ].map((header) => (
                <TableCell key={header} sx={{ fontWeight: 600, textTransform: 'uppercase' }}>
                  {header}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {records.length === 0 ? (
              <TableRow>
                <TableCell colSpan={11} align="center" sx={{ py: 6 }}>
                  <Typography variant="body2" color="text.secondary">
                    No records match the current filter configuration criteria.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              records.map((record, index) => {
                const severity = getSeverity(record.delay);
                const badgeColor =
                  severity === 'heavy'
                    ? { background: '#FEE2E2', color: colors.crimson }
                    : severity === 'moderate'
                      ? { background: '#FFEDD5', color: colors.coral }
                      : { background: '#DBEAFE', color: colors.calm };

                return (
                  <TableRow key={`${record.timestamp}-${index}`} hover>
                    <TableCell sx={{ fontFamily: 'monospace', fontSize: 12 }}>
                      {record.timestamp}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.muted }}>
                      {record.region}
                    </TableCell>
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
                    <TableCell>
                      <Box
                        component="span"
                        sx={{
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 600,
                          bgcolor: badgeColor.background,
                          color: badgeColor.color
                        }}
                      >
                        {record.status || getSeverityLabel(severity)}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.muted, maxWidth: 160 }}>
                      {record.route || '--'}
                    </TableCell>
                    <TableCell sx={{ fontSize: 12, color: colors.muted, maxWidth: 220 }}>
                      {record.notes || '--'}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
