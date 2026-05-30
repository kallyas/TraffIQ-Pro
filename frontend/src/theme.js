import { createTheme } from '@mui/material/styles';

export const colors = {
  bg: '#F4F6F8',
  charcoal: '#1A252F',
  slate: '#2C3E50',
  muted: '#7F8C8D',
  border: '#E2E8F0',
  crimson: '#D63031',
  coral: '#E17055',
  calm: '#2E86DE'
};

const theme = createTheme({
  palette: {
    mode: 'light',
    primary: {
      main: colors.charcoal
    },
    secondary: {
      main: colors.calm
    },
    background: {
      default: colors.bg,
      paper: '#FFFFFF'
    },
    text: {
      primary: colors.charcoal,
      secondary: colors.muted
    }
  },
  typography: {
    fontFamily: '"Inter", "Roboto", "Helvetica", "Arial", sans-serif'
  },
  shape: {
    borderRadius: 10
  },
  components: {
    MuiAppBar: {
      styleOverrides: {
        colorPrimary: {
          backgroundColor: colors.charcoal
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: `1px solid ${colors.border}`
        }
      }
    }
  }
});

export default theme;
