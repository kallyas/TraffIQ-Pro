import React from 'react';
import {
  AppBar,
  Box,
  Button,
  Chip,
  Container,
  FormControlLabel,
  Stack,
  Switch,
  Toolbar,
  Typography
} from '@mui/material';

import { colors } from '../theme.js';
import { formatDateTime } from '../utils/format.js';

const syncStatusConfig = {
  live: { label: 'Live sync', color: colors.calm },
  syncing: { label: 'Syncing...', color: colors.coral },
  error: { label: 'Sync error', color: colors.crimson }
};

export default function HeaderBar({
  syncStatus,
  lastUpdated,
  autoRefresh,
  isFetching,
  onRefresh,
  onToggleAutoRefresh
}) {
  const syncMeta = syncStatusConfig[syncStatus] || syncStatusConfig.live;

  return (
    <AppBar position="static" elevation={0}>
      <Toolbar sx={{ py: 3 }}>
        <Container maxWidth="xl" sx={{ display: 'flex', alignItems: 'center', gap: 3 }}>
          <Stack spacing={0.5} sx={{ flex: 1 }}>
            <Stack direction="row" spacing={2} alignItems="center">
              <Chip label="PRO" size="small" sx={{ bgcolor: colors.calm, color: '#fff' }} />
              <Typography variant="h5" sx={{ fontWeight: 700 }}>
                TraffIQ Intelligence
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              Real-time corridor performance, congestion trends, and operational signals.
            </Typography>
          </Stack>

          <Stack
            direction={{ xs: 'column', md: 'row' }}
            spacing={2}
            alignItems={{ xs: 'flex-start', md: 'center' }}
            sx={{ color: 'rgba(255,255,255,0.9)' }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 2,
                py: 0.5,
                bgcolor: 'rgba(15,23,42,0.35)',
                borderRadius: 999
              }}
            >
              <Box
                sx={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  bgcolor: syncMeta.color
                }}
              />
              <Typography variant="caption">{syncMeta.label}</Typography>
            </Box>
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              Last synced: {lastUpdated ? formatDateTime(lastUpdated) : '--'}
            </Typography>
            <Button
              variant="contained"
              onClick={onRefresh}
              disabled={isFetching}
              sx={{
                bgcolor: colors.calm,
                '&:hover': { bgcolor: '#1D4ED8' }
              }}
            >
              Refresh
            </Button>
            <FormControlLabel
              control={
                <Switch
                  checked={autoRefresh}
                  onChange={(event) => onToggleAutoRefresh(event.target.checked)}
                  color="secondary"
                />
              }
              label={<Typography variant="caption">Auto-refresh</Typography>}
            />
          </Stack>
        </Container>
      </Toolbar>
    </AppBar>
  );
}
