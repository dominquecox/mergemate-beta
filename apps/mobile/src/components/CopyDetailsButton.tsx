import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Button } from './Button';
import { Text } from './Text';
import { useTheme } from '../context/ThemeContext';
import { currentPageUrl, errorReportText, type ErrorReport } from '../api/error-details';

/** Copies a short, secret-free error block that can be pasted to support. */
export function CopyDetailsButton({ report }: { report: Omit<ErrorReport, 'pageUrl'> }) {
  const { colors, typography } = useTheme();
  const [note, setNote] = useState('');
  const key = `${report.code ?? ''}|${report.requestId ?? ''}|${report.runId ?? ''}|${report.message}`;
  useEffect(() => setNote(''), [key]);
  const copy = async () => {
    try {
      if (!(await Clipboard.setStringAsync(errorReportText({ ...report, pageUrl: currentPageUrl() })))) throw new Error('Clipboard unavailable');
      setNote('Details copied. Paste them to MergeMate support.');
    } catch {
      setNote('Could not copy. Select the details above instead.');
    }
  };
  return (
    <View style={{ gap: 4, alignItems: 'flex-start' }}>
      <Button title="Copy details" variant="secondary" onPress={() => void copy()} accessibilityLabel="Copy error details" />
      {note ? <Text accessibilityLiveRegion="polite" style={[typography.caption, { color: colors.textSecondary }]}>{note}</Text> : null}
    </View>
  );
}
