import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import * as Sentry from '@sentry/react-native';
import { ThemeContext, ThemeContextType } from '../context/ThemeContext';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: string | null;
}

/**
 * Error Boundary global pentru toata aplicatia.
 * Prinde erorile de render si afiseaza un fallback UI in loc de crash (ecran alb).
 */
export class GlobalErrorBoundary extends React.Component<Props, State> {
  // Fallback-ul UI folosește culorile temei active; contextType acoperă clasele
  // (fără hook-uri). Dacă vreodată boundary-ul iese din AppThemeProvider, revine
  // la paleta midnight din valoarea default a contextului.
  static contextType = ThemeContext;
  declare context: ThemeContextType;

  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo: errorInfo.componentStack || null });
    // Erorile de render ajung in Sentry (daca DSN-ul e configurat), cu stack-ul componentei.
    if (process.env.EXPO_PUBLIC_SENTRY_DSN) {
      Sentry.captureException(error, {
        extra: { componentStack: errorInfo.componentStack || null },
      });
    }
    // componentStack identifica exact componenta care a cazut — esential la debugging.
    console.error('[GlobalErrorBoundary] Eroare prinsa:', error.message);
    if (errorInfo.componentStack) {
      console.error('[GlobalErrorBoundary] Component stack:', errorInfo.componentStack);
    }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const { colors } = this.context;

      return (
        <View style={[styles.container, { backgroundColor: colors.background }]}>
          <AlertTriangle size={48} color={colors.danger} />
          <Text style={[styles.title, { color: colors.danger }]}>Ceva nu a mers bine</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            A apărut o eroare neașteptată. Nu-ți face griji — datele tale sunt în siguranță.
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={[styles.devError, { color: colors.textTertiary, backgroundColor: colors.surface }]} numberOfLines={6}>
              {this.state.error.message}
            </Text>
          )}
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.accent }]}
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Reîncearcă"
          >
            <RefreshCw size={20} color={colors.textOnAccent} />
            <Text style={[styles.retryText, { color: colors.textOnAccent }]}>Reîncearcă</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  // Culorile sunt setate inline din theme (colors.*) în render; aici doar layout.
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    gap: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 8,
  },
  message: {
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  devError: {
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
  },
  retryText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
});
