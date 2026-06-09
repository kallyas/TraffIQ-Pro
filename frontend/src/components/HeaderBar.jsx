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
  Typography
} from '@mui/material';
import { alpha } from '@mui/material/styles';

import { colors } from '../theme.js';
import { formatDateTime } from '../utils/format.js';

const headerBg = '#081f2f';

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
    <AppBar
      position="static"
      color="transparent"
      elevation={0}
      sx={{
        bgcolor: headerBg,
        borderBottom: `1px solid ${alpha('#fff', 0.12)}`,
        boxShadow: `0 14px 30px ${alpha(colors.slate, 0.18)}`
      }}
    >
      <Box sx={{ bgcolor: headerBg, color: '#fff' }}>
        <Container
          maxWidth="xl"
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'stretch', md: 'flex-start' },
            justifyContent: 'space-between',
            gap: { xs: 2, md: 3 },
            py: { xs: 2, md: 2.25 }
          }}
        >
          <Stack spacing={0.75} sx={{ minWidth: 0, flex: 1 }}>
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', rowGap: 0.75 }}>
              <Chip
                label="PRO"
                size="small"
                sx={{
                  bgcolor: alpha(colors.calm, 0.18),
                  border: `1px solid ${alpha(colors.calm, 0.48)}`,
                  color: '#DCEBFF',
                  fontWeight: 800,
                  letterSpacing: 0
                }}
              />
              <Typography
                variant="h6"
                sx={{
                  fontWeight: 800,
                  fontSize: { xs: 19, md: 22 },
                  lineHeight: 1.15
                }}
              >
                TraffIQ Intelligence
              </Typography>
            </Stack>
            <Typography
              variant="body2"
              sx={{
                color: alpha('#fff', 0.72),
                maxWidth: 620,
                lineHeight: 1.5
              }}
            >
              Live Google Maps traffic-adjusted drive times for the MUSC shuttle corridor.
            </Typography>
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            alignItems="center"
            sx={{
              color: alpha('#fff', 0.9),
              flexWrap: 'wrap',
              justifyContent: { xs: 'flex-start', md: 'flex-end' },
              p: 0.75,
              border: `1px solid ${alpha('#fff', 0.14)}`,
              borderRadius: 2,
              bgcolor: alpha('#fff', 0.06),
              boxShadow: `inset 0 1px 0 ${alpha('#fff', 0.06)}`
            }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.75,
                bgcolor: alpha('#fff', 0.08),
                border: `1px solid ${alpha('#fff', 0.1)}`,
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
              <Typography variant="caption" sx={{ fontWeight: 700, color: '#fff' }}>
                {syncMeta.label}
              </Typography>
            </Box>
            <Typography
              variant="caption"
              sx={{
                color: alpha('#fff', 0.72),
                px: { xs: 0.5, sm: 1 },
                whiteSpace: 'nowrap'
              }}
            >
              Last synced: {lastUpdated ? formatDateTime(lastUpdated) : '--'}
            </Typography>
            <Button
              href="https://coastallimocharleston.com/"
              target="_self"
              variant="outlined"
              size="small"
              sx={{
                borderColor: alpha('#fff', 0.6),
                color: '#fff',
                minHeight: 36,
                px: 1.5,
                '&:hover': {
                  borderColor: '#fff',
                  bgcolor: alpha('#fff', 0.1)
                }
              }}
            >
              Main site
            </Button>
            <Button
              variant="contained"
              size="small"
              onClick={onRefresh}
              disabled={isFetching}
              sx={{
                bgcolor: colors.calm,
                minHeight: 36,
                px: 1.75,
                '&:hover': { bgcolor: '#1D4ED8' }
              }}
            >
              Refresh
            </Button>
            <FormControlLabel
              sx={{
                m: 0,
                pl: { xs: 0, sm: 0.5 },
                '.MuiFormControlLabel-label': { lineHeight: 1 }
              }}
              control={
                <Switch
                  size="small"
                  checked={autoRefresh}
                  onChange={(event) => onToggleAutoRefresh(event.target.checked)}
                  color="secondary"
                />
              }
              label={<Typography variant="caption">Auto-refresh</Typography>}
            />
          </Stack>
        </Container>
      </Box>
    </AppBar>
  );
}
