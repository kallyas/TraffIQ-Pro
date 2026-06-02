import { alpha, createTheme } from '@mui/material/styles';

export const colors = {
  bg: '#F5F7FB',
  surface: '#FFFFFF',
  charcoal: '#111827',
  slate: '#1F2937',
  muted: '#6B7280',
  border: '#E5E7EB',
  crimson: '#DC2626',
  coral: '#F97316',
  calm: '#2563EB',
  indigo: '#4338CA',
  teal: '#0F766E',
  // Google Maps-style route palette. The basemap is light grey, so the
  // recommended line is coloured by live congestion (Google's green/amber/red
  // traffic overlay) and the alternative uses Google's route blue — both ride
  // on a white casing so they stay visible against the grey tiles.
  trafficClear: '#34A853', // green  — free-flowing
  trafficModerate: '#FBBC04', // amber — some congestion
  trafficHeavy: '#EA4335', // red   — heavy traffic
  routeAlt: '#4285F4', // Google route blue — the alternate corridor
  routeCasing: '#FFFFFF'
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: colors.indigo
    },
    secondary: {
      main: colors.calm
    },
    background: {
      default: colors.bg,
      paper: colors.surface
    },
    text: {
      primary: colors.charcoal,
      secondary: colors.muted
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif',
    h4: {
      fontWeight: 700
    },
    h5: {
      fontWeight: 700
    },
    subtitle1: {
      fontWeight: 600
    },
    subtitle2: {
      fontWeight: 600,
      textTransform: 'uppercase',
      letterSpacing: '0.06em'
    }
  },
  shape: {
    borderRadius: 16
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: colors.slate
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          textTransform: 'none',
          fontWeight: 600
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: `1px solid ${colors.border}`,
          boxShadow: `0 18px 40px ${alpha(colors.slate, 0.08)}`
        }
      }
    }
  }
});

export default theme;
