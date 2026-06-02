import React, { useEffect, useMemo, useRef } from 'react';
import { Box, Chip, Paper, Stack, Typography } from '@mui/material';
import L from 'leaflet';

import { colors } from '../theme.js';
import { decodePolyline } from '../utils/format.js';
import { getLatestComparison, getSeverity, getSeverityLabel } from '../utils/traffic.js';

const MAP_CENTER = [32.7886, -79.9835];

const SEVERITY_STYLE = {
  heavy: { color: colors.trafficHeavy, weight: 8 },
  moderate: { color: colors.trafficModerate, weight: 7 },
  normal: { color: colors.trafficClear, weight: 6 }
};

// Soft background tints for the legend/severity pills, keyed to the line colour.
const SEVERITY_TINT = {
  heavy: '#FCE8E6',
  moderate: '#FEF7E0',
  normal: '#E6F4EA'
};

function endpointIcon(fill) {
  return L.divIcon({
    className: 'traffiq-endpoint',
    html: `<span style="display:block;width:14px;height:14px;border-radius:50%;background:${fill};border:3px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,0.25)"></span>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
}

function pathFor(record) {
  if (!record) return [];
  const decoded = decodePolyline(record.polyline);
  if (decoded.length >= 2) return decoded;
  if ([record.originLat, record.originLng, record.destLat, record.destLng].every(Number.isFinite)) {
    return [
      [record.originLat, record.originLng],
      [record.destLat, record.destLng]
    ];
  }
  return [];
}

export default function RouteMapCard({ records }) {
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const altLineRef = useRef(null);
  const altCasingRef = useRef(null);
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

    // Alternative corridor (Google route-blue, dashed) sits beneath the
    // recommended route. Its own white casing keeps it readable on the grey map.
    altCasingRef.current = L.polyline([], { color: colors.routeCasing, weight: 9, opacity: 0.9 }).addTo(map);
    altLineRef.current = L.polyline([], {
      color: colors.routeAlt,
      weight: 5,
      opacity: 0.9,
      dashArray: '6 8',
      lineCap: 'round',
      lineJoin: 'round'
    }).addTo(map);
    casingRef.current = L.polyline([], { color: colors.routeCasing, weight: 10, opacity: 0.9 }).addTo(map);
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

  const comparison = useMemo(() => getLatestComparison(records), [records]);

  const recommendedPath = useMemo(() => pathFor(comparison?.recommended), [comparison]);
  const alternativePath = useMemo(() => pathFor(comparison?.alternative), [comparison]);

  useEffect(() => {
    const map = mapInstance.current;
    const routeLine = routeLineRef.current;
    const altLine = altLineRef.current;
    const altCasing = altCasingRef.current;
    const casing = casingRef.current;
    const markerOrigin = markerOriginRef.current;
    const markerDest = markerDestRef.current;

    if (!map || !routeLine || !altLine || !altCasing || !casing || !markerOrigin || !markerDest) return;

    if (!comparison || recommendedPath.length < 2) {
      routeLine.setLatLngs([]);
      altLine.setLatLngs([]);
      altCasing.setLatLngs([]);
      casing.setLatLngs([]);
      return;
    }

    routeLine.setLatLngs(recommendedPath);
    casing.setLatLngs(recommendedPath);
    const altPoints = alternativePath.length >= 2 ? alternativePath : [];
    altLine.setLatLngs(altPoints);
    altCasing.setLatLngs(altPoints);

    const origin = recommendedPath[0];
    const dest = recommendedPath[recommendedPath.length - 1];
    markerOrigin.setLatLng(origin).bindPopup(`<b>${comparison.origin}</b><br/>Origin`);
    markerDest.setLatLng(dest).bindPopup(`<b>${comparison.destination}</b><br/>Destination`);

    routeLine.setStyle(SEVERITY_STYLE[getSeverity(comparison.recommended.delay)] || SEVERITY_STYLE.normal);

    const bounds = routeLine.getBounds();
    if (alternativePath.length >= 2) bounds.extend(altLine.getBounds());
    map.fitBounds(bounds, { padding: [40, 40] });
  }, [comparison, recommendedPath, alternativePath]);

  const rec = comparison?.recommended;
  const severity = rec ? getSeverity(rec.delay) : 'normal';

  return (
    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <Stack spacing={2} sx={{ flexGrow: 1 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start">
          <Box>
            <Typography variant="subtitle1">Recommended Route</Typography>
            <Typography variant="body2" color="text.secondary">
              Fastest corridor right now, with the alternate highway shown dashed.
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            <Chip label="Normal" size="small" sx={{ bgcolor: SEVERITY_TINT.normal, color: colors.trafficClear }} />
            <Chip label="Moderate" size="small" sx={{ bgcolor: SEVERITY_TINT.moderate, color: '#B06000' }} />
            <Chip label="Heavy" size="small" sx={{ bgcolor: SEVERITY_TINT.heavy, color: colors.trafficHeavy }} />
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

          {rec && (
            <Box
              sx={{
                position: 'absolute',
                top: 12,
                left: 12,
                zIndex: 500,
                p: 1.75,
                minWidth: 240,
                maxWidth: 300,
                borderRadius: 2,
                bgcolor: 'rgba(255,255,255,0.94)',
                border: `1px solid ${colors.border}`,
                boxShadow: '0 10px 30px rgba(15,23,42,0.12)',
                backdropFilter: 'blur(6px)'
              }}
            >
              <Typography variant="subtitle2" sx={{ textTransform: 'none', letterSpacing: 0 }}>
                {comparison.origin} → {comparison.destination}
              </Typography>

              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.75 }}>
                <Chip
                  label="Take this"
                  size="small"
                  sx={{ bgcolor: colors.teal, color: '#fff', fontWeight: 700, height: 20 }}
                />
                <Typography variant="subtitle2" sx={{ textTransform: 'none', letterSpacing: 0 }}>
                  {rec.route || 'Fastest route'}
                </Typography>
              </Stack>

              <Stack direction="row" spacing={2} sx={{ mt: 1 }}>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Live
                  </Typography>
                  <Typography variant="h6" sx={{ lineHeight: 1.1 }}>
                    {rec.live.toFixed(0)} min
                  </Typography>
                </Box>
                <Box>
                  <Typography variant="caption" color="text.secondary">
                    Free-flow
                  </Typography>
                  <Typography variant="h6" sx={{ lineHeight: 1.1, color: colors.muted }}>
                    {rec.base.toFixed(0)} min
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
                    color: severity === 'moderate' ? '#B06000' : SEVERITY_STYLE[severity].color,
                    bgcolor: SEVERITY_TINT[severity]
                  }}
                >
                  {getSeverityLabel(severity)} · +{rec.delay.toFixed(0)}m
                </Box>
                {Number.isFinite(rec.distance) && rec.distance > 0 && (
                  <Typography variant="caption" color="text.secondary">
                    {rec.distance.toFixed(1)} mi
                  </Typography>
                )}
              </Stack>

              {comparison.alternative && (
                <Typography
                  variant="caption"
                  color="text.secondary"
                  sx={{ display: 'block', mt: 1.25, pt: 1, borderTop: `1px solid ${colors.border}` }}
                >
                  {comparison.savingsMin >= 0.5
                    ? `${comparison.savingsMin.toFixed(0)} min faster than ${comparison.alternative.route} (${comparison.alternative.live.toFixed(0)} min).`
                    : `About even with ${comparison.alternative.route} (${comparison.alternative.live.toFixed(0)} min).`}
                </Typography>
              )}
            </Box>
          )}
        </Box>
      </Stack>
    </Paper>
  );
}
