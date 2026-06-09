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

const parkChsNavLinks = [
  { label: 'Home', href: 'https://parkchs.com/' },
  {
    label: 'Annual Member Parking Reservation',
    href: 'https://parkchs.com/annual-member/'
  },
  { label: 'Turo Host Program', href: 'https://parkchs.com/turo-host-program/' },
  { label: 'Contact Us', href: 'https://parkchs.com/contact/' }
];

const parkChsLogoUrl =
  'https://parkchs.com/wp-content/uploads/2026/01/cropped-cropped-charleston-park-and-go-logo.png';
const parkChsNavBg = '#081f2f';

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
        bgcolor: parkChsNavBg,
        borderBottom: `1px solid ${colors.border}`
      }}
    >
      <Toolbar sx={{ minHeight: { xs: 88, md: 96 }, py: { xs: 1.5, md: 0 } }}>
        <Container
          maxWidth="xl"
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', lg: 'row' },
            alignItems: { xs: 'stretch', lg: 'center' },
            gap: { xs: 2, lg: 4 }
          }}
        >
          <Button
            href="https://parkchs.com/"
            target="_self"
            sx={{
              alignSelf: { xs: 'flex-start', lg: 'center' },
              display: 'inline-flex',
              alignItems: 'center',
              gap: 1.5,
              p: 0,
              color: colors.charcoal,
              textAlign: 'left',
              '&:hover': { bgcolor: 'transparent' }
            }}
          >
            <Box
              component="img"
              src={parkChsLogoUrl}
              alt="Charleston Park & Go"
              sx={{
                width: { xs: 92, sm: 112 },
                height: 'auto',
                display: 'block',
                flexShrink: 0
              }}
            />
            <Box>
              <Typography variant="subtitle1" sx={{ color: '#fff', lineHeight: 1.1 }}>
                Charleston Park & Go
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: 'rgba(255,255,255,0.72)',
                  display: 'block',
                  fontWeight: 600,
                  lineHeight: 1.4
                }}
              >
                Airport parking near CHS
              </Typography>
            </Box>
          </Button>

          <Stack
            component="nav"
            direction="row"
            spacing={{ xs: 0.5, md: 1.5 }}
            sx={{
              flex: 1,
              flexWrap: 'wrap',
              justifyContent: { xs: 'flex-start', lg: 'center' },
              rowGap: 0.5
            }}
          >
            {parkChsNavLinks.map((link) => (
              <Button
                key={link.href}
                href={link.href}
                target="_self"
                size="small"
                sx={{
                  color: '#fff',
                  fontSize: 14,
                  fontWeight: 700,
                  px: { xs: 1, md: 1.25 },
                  py: 1,
                  minWidth: 0,
                  '&:hover': {
                    bgcolor: 'rgba(255,255,255,0.1)',
                    color: '#fff'
                  }
                }}
              >
                {link.label}
              </Button>
            ))}
          </Stack>

          <Stack
            direction="row"
            spacing={1}
            sx={{
              justifyContent: { xs: 'flex-start', lg: 'flex-end' },
              flexWrap: 'wrap',
              rowGap: 1
            }}
          >
            <Button
              href="https://parkchs.com/annual-member/"
              target="_self"
              variant="contained"
              sx={{
                bgcolor: colors.teal,
                color: '#fff',
                px: 2.25,
                '&:hover': { bgcolor: '#115E59' }
              }}
            >
              Annual Member
            </Button>
            <Button
              href="https://parkchs.com/"
              target="_self"
              variant="outlined"
              sx={{
                borderColor: 'rgba(255,255,255,0.8)',
                color: '#fff',
                px: 2.25,
                '&:hover': {
                  borderColor: '#fff',
                  bgcolor: 'rgba(255,255,255,0.1)'
                }
              }}
            >
              Back to Park CHS
            </Button>
          </Stack>
        </Container>
      </Toolbar>

      <Box sx={{ bgcolor: parkChsNavBg, color: '#fff' }}>
        <Container
          maxWidth="xl"
          sx={{
            display: 'flex',
            flexDirection: { xs: 'column', md: 'row' },
            alignItems: { xs: 'stretch', md: 'center' },
            justifyContent: 'space-between',
            gap: 2,
            py: 1.5
          }}
        >
          <Stack spacing={0.25}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Chip label="PRO" size="small" sx={{ bgcolor: colors.calm, color: '#fff' }} />
              <Typography variant="h6" sx={{ fontWeight: 800, fontSize: { xs: 18, md: 20 } }}>
                TraffIQ Intelligence
              </Typography>
            </Stack>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.7)' }}>
              Live Google Maps traffic-adjusted drive times for the MUSC shuttle corridor.
            </Typography>
          </Stack>

          <Stack
            direction={{ xs: 'column', sm: 'row' }}
            spacing={1.5}
            alignItems={{ xs: 'flex-start', sm: 'center' }}
            sx={{ color: 'rgba(255,255,255,0.9)' }}
          >
            <Box
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                px: 1.5,
                py: 0.5,
                bgcolor: 'rgba(255,255,255,0.1)',
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
            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.72)' }}>
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
              sx={{ m: 0 }}
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
      </Box>
    </AppBar>
  );
}
