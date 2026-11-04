import React, { useMemo } from 'react';
import { View } from 'react-native';
import { Text } from '../components/Text';
import { useTheme } from '../context/ThemeContext';
import { parseUnifiedDiff } from './patch-diff';

/** One file as a diff: added lines green, removed red, 3 lines of context, unchanged sections collapsed. */
export function PatchDiff({ diff }: { diff: string }) {
  const { colors, typography } = useTheme();
  const { rows, added, removed } = useMemo(() => parseUnifiedDiff(diff), [diff]);
  return (
    <View accessibilityLabel={`${added} lines added, ${removed} lines removed`}>
      <Text style={[typography.caption, { color: colors.textSecondary, marginBottom: 6 }]}>
        <Text style={[typography.caption, { color: colors.riskLow, fontWeight: '700' }]}>+{added}</Text>
        {'  '}
        <Text style={[typography.caption, { color: colors.riskHigh, fontWeight: '700' }]}>-{removed}</Text>
      </Text>
      {rows.map((row, index) => {
        if (row.kind === 'gap') {
          return (
            <Text key={index} style={[typography.caption, { color: colors.textMuted, textAlign: 'center', paddingVertical: 4, backgroundColor: colors.surfaceElevated }]}>
              {row.hidden} unchanged {row.hidden === 1 ? 'line' : 'lines'}
            </Text>
          );
        }
        if (row.kind === 'note') return <Text key={index} style={[typography.code, { color: colors.textMuted, fontSize: 11, fontStyle: 'italic' }]}>{row.text}</Text>;
        const tone = row.kind === 'add' ? { bg: colors.riskLowBg, fg: colors.riskLow, sign: '+' } : row.kind === 'del' ? { bg: colors.riskHighBg, fg: colors.riskHigh, sign: '-' } : { bg: 'transparent', fg: colors.textSecondary, sign: ' ' };
        return (
          <View key={index} accessibilityLabel={`${row.kind === 'add' ? 'Added' : row.kind === 'del' ? 'Removed' : 'Unchanged'}: ${row.text}`} style={{ flexDirection: 'row', backgroundColor: tone.bg }}>
            <Text style={[typography.code, { color: colors.textMuted, fontSize: 10, width: 34, textAlign: 'right', paddingRight: 6 }]}>{row.kind === 'del' ? row.oldLine : row.newLine}</Text>
            <Text style={[typography.code, { color: tone.fg, fontSize: 11, width: 14 }]}>{tone.sign}</Text>
            <Text selectable style={[typography.code, { color: row.kind === 'ctx' ? colors.text : tone.fg, fontSize: 11, flex: 1 }]}>{row.text}</Text>
          </View>
        );
      })}
    </View>
  );
}
