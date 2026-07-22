import React from 'react';
import { KeyboardAvoidingView, Platform, StyleSheet, StyleProp, ViewStyle } from 'react-native';
import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';

interface Props {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Componentă internă care apelează hook-ul necondiționat (are context navigare)
function KeyboardAwareWithTabBar({ children, style }: Props) {
  const tabBarHeight = useBottomTabBarHeight();
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? tabBarHeight : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

// Fallback fără tab bar (pentru ecrane modale, stack screens etc.)
function KeyboardAwareFallback({ children, style }: Props) {
  return (
    <KeyboardAvoidingView
      style={[styles.flex, style]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
    >
      {children}
    </KeyboardAvoidingView>
  );
}

// Wrapper cu ErrorBoundary ușor — dacă nu există context tab bar (ecran modal),
// folosim fallback-ul. Altfel folosim componenta cu tab bar height real.
class KeyboardAwareScreen extends React.Component<Props, { hasTabBarCtx: boolean }> {
  constructor(props: Props) {
    super(props);
    this.state = { hasTabBarCtx: true };
  }

  static getDerivedStateFromError() {
    return { hasTabBarCtx: false };
  }

  render() {
    if (this.state.hasTabBarCtx) {
      return (
        <KeyboardAwareWithTabBar style={this.props.style}>
          {this.props.children}
        </KeyboardAwareWithTabBar>
      );
    }
    return (
      <KeyboardAwareFallback style={this.props.style}>
        {this.props.children}
      </KeyboardAwareFallback>
    );
  }
}

export default KeyboardAwareScreen;

const styles = StyleSheet.create({ flex: { flex: 1 } });

// Constantă partajată pentru contentContainerStyle în liste/scrollview-uri
export const CONTENT_BOTTOM_PADDING = 160;

