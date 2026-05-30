import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import L from 'leaflet';

import { colors } from '../theme.js';
import { getSeverity } from '../utils/traffic.js';

const MAP_CENTER = [32.7886, -79.9835];

export default function RouteMapCard({ records }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const routeLineRef = useRef(null);
  const markerOriginRef = useRef(null);
  const markerDestRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomControl: false }).setView(MAP_CENTER, 13);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap CARTO'
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    routeLineRef.current = L.polyline([], { color: colors.calm, weight: 5, opacity: 0.8 }).addTo(map);
    markerOriginRef.current = L.circleMarker([0, 0], {
      radius: 6,
      fillColor: colors.charcoal,
      color: '#FFFFFF',
      weight: 2,
      fillOpacity: 1
    }).addTo(map);
    markerDestRef.current = L.circleMarker([0, 0], {
      radius: 6,
      fillColor: colors.charcoal,
      color: '#FFFFFF',
      weight: 2,
      fillOpacity: 1
    }).addTo(map);

    mapInstance.current = map;
  }, []);

  const latest = useMemo(() => (records.length ? records[0] : null), [records]);

  useEffect(() => {
    const map = mapInstance.current;
    const routeLine = routeLineRef.current;
    const markerOrigin = markerOriginRef.current;
    const markerDest = markerDestRef.current;

    if (!map || !routeLine || !markerOrigin || !markerDest) return;

    if (!latest) {
      routeLine.setLatLngs([]);
      return;
    }

    if (![latest.originLat, latest.originLng, latest.destLat, latest.destLng].every(Number.isFinite)) {
      return;
    }

    const originCoords = [latest.originLat, latest.originLng];
    const destCoords = [latest.destLat, latest.destLng];

    routeLine.setLatLngs([originCoords, destCoords]);
    markerOrigin.setLatLng(originCoords).bindPopup(`<b>${latest.origin} Base Hub</b>`);
    markerDest.setLatLng(destCoords).bindPopup(`<b>${latest.destination} Depot Node</b>`);

    const severity = getSeverity(latest.delay);
    if (severity === 'heavy') {
      routeLine.setStyle({ color: colors.crimson, weight: 8 });
    } else if (severity === 'moderate') {
      routeLine.setStyle({ color: colors.coral, weight: 6 });
    } else {
      routeLine.setStyle({ color: colors.calm, weight: 5 });
    }

    map.fitBounds(routeLine.getBounds(), { padding: [30, 30] });
  }, [latest]);

  return (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack spacing={2} sx={{ flexGrow: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Box>
            <Typography variant="subtitle1">Route Corridor Performance</Typography>
            <Typography variant="body2" color="text.secondary">
              Live route path and delay severity from the latest sample.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip label="Normal" size="small" sx={{ bgcolor: '#DBEAFE', color: colors.calm }} />
            <Chip label="Moderate" size="small" sx={{ bgcolor: '#FFEDD5', color: colors.coral }} />
            <Chip label="Heavy" size="small" sx={{ bgcolor: '#FEE2E2', color: colors.crimson }} />
          </Stack>
        </Stack>
        <Box
          ref={mapRef}
          sx={{
            flexGrow: 1,
            minHeight: { xs: 320, md: 420 },
            height: '100%',
            borderRadius: 0,
            overflow: 'hidden',
            bgcolor: '#F9FAFB'
          }}
        />
      </Stack>
    </Paper>
  );
}
