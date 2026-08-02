import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { AlertTriangle, RefreshCw } from 'lucide-react-native';
import log from '../lib/logger';

interface Props {
  children: React.ReactNode;
  /** Numele ecranului, folosit in raportarea erorii. */
  screenName: string;
  fallback?: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * MUST-FIX #11 (audit productie): exista un singur Error Boundary global,
 * deci o eroare intr-un singur tab darama toata aplicatia.
 *
 * `ScreenErrorBoundary` izoleaza eroarea la nivel de ecran: restul aplicatiei
 * (tab bar, navigatie, sesiune) ramane functional, iar utilizatorul poate
 * reincerca doar ecranul cazut.
 *
 * Utilizare:
 * ```tsx
 * export default function Ecran() {
 *   return (
 *     <ScreenErrorBoundary screenName="Jurnal">
 *       <ContinutJurnal />
 *     </ScreenErrorBoundary>
 *   );
 * }
 * ```
 */
export class ScreenErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    log.error(
      `[ScreenErrorBoundary:${this.props.screenName}]`,
      error,
      errorInfo.componentStack ?? '',
    );
  }

  handleRetry = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback) return <>{this.props.fallback}</>;

    return (
      <View style={styles.container}>
        <AlertTriangle size={36} color="#F87171" />
        <Text style={styles.title}>Acest ecran nu a putut fi încărcat</Text>
        <Text style={styles.message}>
          Restul aplicației funcționează normal. Datele tale sunt în siguranță.
        </Text>
        {__DEV__ && this.state.error ? (
          <Text style={styles.devError} numberOfLines={5}>
            {this.state.error.message}
          </Text>
        ) : null}
        <TouchableOpacity
          style={styles.retryButton}
          onPress={this.handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Reîncarcă ecranul"
        >
          <RefreshCw size={18} color="#090C0E" />
          <Text style={styles.retryText}>Reîncarcă</Text>
        </TouchableOpacity>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 28,
    gap: 12,
  },
  title: { color: '#F1F5F9', fontSize: 17, fontWeight: '700', textAlign: 'center' },
  message: { color: '#9CA3AF', fontSize: 14, textAlign: 'center', lineHeight: 20 },
  devError: {
    color: '#6B7280',
    fontSize: 11,
    fontFamily: 'monospace',
    textAlign: 'center',
    backgroundColor: '#12161A',
    padding: 10,
    borderRadius: 8,
    overflow: 'hidden',
    maxWidth: '100%',
  },
  retryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#CCFF00',
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: 12,
    gap: 8,
    marginTop: 4,
  },
  retryText: { color: '#090C0E', fontSize: 15, fontWeight: '700' },
});

export default ScreenErrorBoundary;
