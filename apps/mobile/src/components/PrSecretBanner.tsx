import React from 'react';
import {View} from 'react-native';
import type {PrDetail} from '../types';
import {useTheme} from '../context/ThemeContext';
import {Icon} from './Icon';
import {Text} from './Text';
export function PrSecretBanner({detail}:{detail:PrDetail}){
const {colors,typography,spacing,radius}=useTheme();
const styles={secretBanner:{padding:14,borderWidth:1},secretTitleRow:{flexDirection:'row' as const,alignItems:'center' as const,gap:6},codeBox:{padding:8}};
return <>
            {/* US-25: Secret Leak Warning Banner */}
            {detail.secretWarning && (
              <View
                style={[
                  styles.secretBanner,
                  {
                    backgroundColor: colors.secretWarningBg,
                    borderColor: colors.secretWarning,
                    borderRadius: radius.md,
                    marginTop: spacing.sm,
                  },
                ]}
                accessibilityRole="alert"
              >
                <View style={styles.secretTitleRow}>
                  <Icon name="warning" size={18} color={colors.secretWarning} />
                  <Text style={[typography.headline, { color: colors.secretWarning, fontWeight: "700" }]}>
                    POSSIBLE SECRET DETECTED
                  </Text>
                </View>
                <Text style={[typography.footnote, { color: colors.text, marginTop: 4, lineHeight: 18 }]}>
                  Pattern matched {detail.secretWarning.rule} at {detail.secretWarning.file}:
                  {detail.secretWarning.line}. Raw secret values are always masked and never sent to AI.
                </Text>
                <View style={[styles.codeBox, { backgroundColor: "rgba(0,0,0,0.45)", borderRadius: radius.sm, marginTop: 6 }]}>
                  <Text style={[typography.code, { color: "#FEE2E2" }]}>
                    {detail.secretWarning.maskedSnippet}
                  </Text>
                </View>
                {(detail.risk?.secretFindings?.length ?? 0) > 1 && (
                  <Text style={[typography.footnote, { color: colors.text, marginTop: 6 }]} selectable>
                    Also at {detail.risk!.secretFindings!.slice(1, 6).map((finding) => `${finding.file}:${finding.line}`).join(", ")}
                    {detail.risk!.secretFindings!.length > 6 ? ` and ${detail.risk!.secretFindings!.length - 6} more` : ""}.
                  </Text>
                )}
              </View>
            )}

</>;
}
