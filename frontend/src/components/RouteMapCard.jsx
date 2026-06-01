import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import L from 'leaflet';

import { colors } from '../theme.js';
import { decodePolyline } from '../utils/format.js';
import { getSeverity, getSeverityLabel } from '../utils/traffic.js';

const MAP_CENTER = [32.7886, -79.9835];

const SEVERITY_STYLE = {
  heavy: { color: colors.crimson, weight: 8 },
  moderate: { color: colors.coral, weight: 6 },
  normal: { color: colors.calm, weight: 5 }
};

function endpointIcon(fill) {
  return L.divIcon({
    className: 'traffiq-endpoint',
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${fill};border:3px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,0.25)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

export default function RouteMapCard({ records }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const routeLineRef = useRef(null);
  const casingRef = useRef(null);
  const markerOriginRef = useRef(null);
  const markerDestRef = useRef(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, { zoomControl: false }).setView(MAP_CENTER, 12);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      attribution: '© OpenStreetMap CARTO',
      maxZoom: 19
    }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    // A wider white "casing" sits under the colored route for a Maps-like look.
    casingRef.current = L.polyline([], { color: '#FFFFFF', weight: 10, opacity: 0.9 }).addTo(map);
    routeLineRef.current = L.polyline([], {
      color: colors.calm,
      weight: 5,
      opacity: 0.95,
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
    markerOriginRef.current = L.marker([0, 0], { icon: endpointIcon(colors.teal) }).addTo(map);
    markerDestRef.current = L.marker([0, 0], { icon: endpointIcon(colors.crimson) }).addTo(map);

    mapInstance.current = map;
  }, []);

  const latest = useMemo(() => (records.length ? records[0] : null), [records]);

  const path = useMemo(() => {
    if (!latest) return [];
    const decoded = decodePolyline(latest.polyline);
    if (decoded.length >= 2) return decoded;
    // Fallback: straight segment between geocoded endpoints when no polyline.
    if ([latest.originLat, latest.originLng, latest.destLat, latest.destLng].every(Number.isFinite)) {
      return [
        [latest.originLat, latest.originLng],
        [latest.destLat, latest.destLng]
      ];
    }
    return [];
  }, [latest]);

  useEffect(() => {
    const map = mapInstance.current;
    const routeLine = routeLineRef.current;
    const casing = casingRef.current;
    const markerOrigin = markerOriginRef.current;
    const markerDest = markerDestRef.current;

    if (!map || !routeLine || !casing || !markerOrigin || !markerDest) return;

    if (!latest || path.length < 2) {
      routeLine.setLatLngs([]);
      casing.setLatLngs([]);
      return;
    }

    routeLine.setLatLngs(path);
    casing.setLatLngs(path);

    const origin = path[0];
    const dest = path[path.length - 1];
    markerOrigin.setLatLng(origin).bindPopup(`<b>${latest.origin}</b><br/>Origin`);
    markerDest.setLatLng(dest).bindPopup(`<b>${latest.destination}</b><br/>Destination`);

    routeLine.setStyle(SEVERITY_STYLE[getSeverity(latest.delay)] || SEVERITY_STYLE.normal);

    map.fitBounds(routeLine.getBounds(), { padding: [40, 40] });
  }, [latest, path]);

  const severity = latest ? getSeverity(latest.delay) : 'normal';

  return (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack spacing={2} sx={{ flexGrow: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="subtitle1">Live Driving Route</Typography>
            <Typography variant="body2" color="text.secondary">
              Actual Google-traced path and traffic-adjusted time for the latest sample.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip label="Normal" size="small" sx={{ bgcolor: '#DBEAFE', color: colors.calm }} />
            <Chip label="Moderate" size="small" sx={{ bgcolor: '#FFEDD5', color: colors.coral }} />
            <Chip label="Heavy" size="small" sx={{ bgcolor: '#FEE2E2', color: colors.crimson }} />
          </Stack>
        </Stack>

        <Box sx={{ position: 'relative', flexGrow: 1 }}>
          <Box
            ref={mapRef}
            sx={{
              flexGrow: 1,
              minHeight: { xs: 320, md: 440 },
              height: '100%',
              borderRadius: 2,
              overflow: 'hidden',
              bgcolor: '#F9FAFB'
            }}
          />

          {latest && (
            <Box
              sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                zIndex: 500,
                p: 1.75,
                minWidth: 220,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.94)',
                border: `1px solid ${colors.border}`,
                boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
                backdropFilter: 'blur(6px)'
              }}
            >
              <Typography variant="subtitle2" sx={{ textTransform: 'none', letterSpacing: 0 }}>
                {latest.origin} → {latest.destination}
              </Typography>
              {latest.route && (
                <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                  via {latest.route}
                </Typography>
              )}
              <Stack direction="row" spacing={2} sx={{ mt: 0.5 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Live
                  </Typography>
                  <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                    {latest.live.toFixed(0)} min
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Free-flow
                  </Typography>
                  <Typography variant="h6" sx={{ lineHeight: 1.1, color: colors.muted }}>
                    {latest.base.toFixed(0)} min
                  </Typography>
                </Box>
              </Stack>
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 1.25 }}>
                <Box
                  component="span"
                  sx={{
                    px: 1,
                    py: 0.25,
                    borderRadius: 999,
                    fontSize: 11,
                    fontWeight: 700,
                    color: SEVERITY_STYLE[severity].color,
                    bgcolor:
                      severity === 'heavy'
                        ? '#FEE2E2'
                        : severity === 'moderate'
                          ? '#FFEDD5'
                          : '#DBEAFE'
                  }}
                >
                  {getSeverityLabel(severity)} · +{latest.delay.toFixed(0)}m
                </Box>
                {Number.isFinite(latest.distance) && latest.distance > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {latest.distance.toFixed(1)} mi
                  </Typography>
                )}
              </Stack>
            </Box>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
