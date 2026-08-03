import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import * as Sentry from '@sentry/react-native';

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
    console.error('[GlobalErrorBoundary] Eroare prinsa:', error.message);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <View style={styles.container}>
          <AlertTriangle size={48} color="#F87171" />
          <Text style={styles.title}>Ceva nu a mers bine</Text>
          <Text style={styles.message}>
            A apărut o eroare neașteptată. Nu-ți face griji — datele tale sunt în siguranță.
          </Text>
          {__DEV__ && this.state.error && (
            <Text style={styles.devError} numberOfLines={6}>
              {this.state.error.message}
            </Text>
          )}
          <TouchableOpacity
            style={styles.retryButton}
            onPress={this.handleRetry}
            accessibilityRole="button"
            accessibilityLabel="Reîncearcă"
          >
            <RefreshCw size={20} color="#090C0E" />
            <Text style={styles.retryText}>Reîncearcă</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#090C0E',
    padding: 32,
    gap: 16,
  },
  title: {
    color: '#F87171',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    marginTop: 8,
  },
  message: {
    color: '#9CA3AF',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  devError: {
    color: '#6B7280',
    fontSize: 12,
    fontFamily: 'monospace',
    textAlign: 'center',
    backgroundColor: '#12161A',
    padding: 12,
    borderRadius: 8,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#CCFF00',
    paddingHorizontal: 24,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
  },
  retryText: {
    color: '#090C0E',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
