import React from 'react';
import {View,TouchableOpacity} from 'react-native';
import type {PrDetail} from '../types';
import {useTheme} from '../context/ThemeContext';
import {riskEvidence} from '../workspace/risk';
import {riskAssessmentText} from '../api/mappers';
import {Icon} from './Icon';
import {Text} from './Text';
import {RiskBadge} from './RiskBadge';
export function PrRiskPanel({detail,assessmentOpen,setAssessmentOpen,jumpToFile}:{detail:PrDetail;assessmentOpen:boolean;setAssessmentOpen:React.Dispatch<React.SetStateAction<boolean>>;jumpToFile:(name:string)=>void}){
const {colors,typography,spacing,radius}=useTheme();
const styles={card:{padding:16,borderWidth:1},riskHeader:{flexDirection:'row' as const,alignItems:'center' as const,justifyContent:'space-between' as const}};
return <>
                    {/* Risk Assessment Card (US-10) */}
                    {detail.risk && (
                      <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border, borderRadius: radius.lg, marginTop: spacing.sm }]}>
                        <View style={[styles.riskHeader, { flexWrap: "wrap", gap: 8 }]}>
                          <Text style={[typography.headline, { color: colors.text }]} accessibilityRole="header">
                            Why this risk
                          </Text>
                          <RiskBadge level={detail.risk.level} secretWarning={detail.secretWarning} />
                        </View>

                        <View style={{ marginTop: spacing.sm, gap: 8 }}>
                          {riskEvidence(detail.risk, detail.files, detail.checks)
                            .filter((item, _, all) => all.length === 1 || !item.reason.startsWith("No rule-based risk signals"))
                            .slice(0, 3)
                            .map(({ reason, file, check }, idx) => {
                              const cleanReason = reason.replace(/^[\s•\-*]+/, "").trim();
                              const isHigh = detail.risk!.level === "high";
                              const isMedium = detail.risk!.level === "medium";
                              const badgeBg = isHigh ? colors.riskHighBg : isMedium ? colors.riskMediumBg : colors.riskLowBg;
                              const badgeColor = isHigh ? colors.riskHigh : isMedium ? colors.riskMedium : colors.riskLow;
                              const iconName = isHigh ? "alert-circle" : isMedium ? "warning" : "checkmark-circle";
                              return (
                                <View
                                  key={idx}
                                  style={{
                                    flexDirection: "row",
                                    alignItems: "flex-start",
                                    gap: 10,
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    backgroundColor: colors.surfaceElevated,
                                    borderRadius: radius.md,
                                    borderWidth: 1,
                                    borderColor: colors.border,
                                  }}
                                  testID="risk-reason"
                                >
                                  <View
                                    style={{
                                      width: 22,
                                      height: 22,
                                      borderRadius: 11,
                                      backgroundColor: badgeBg,
                                      alignItems: "center",
                                      justifyContent: "center",
                                      marginTop: 1,
                                    }}
                                  >
                                    <Icon name={iconName} size={14} color={badgeColor} />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={[typography.callout, { color: colors.text, lineHeight: 20 }]}>
                                      {cleanReason}
                                    </Text>
                                    {!!file && (
                                      <TouchableOpacity
                                        accessibilityRole="button"
                                        accessibilityLabel={`Open ${file}, the file behind this reason`}
                                        onPress={() => jumpToFile(file)}
                                        style={{ minHeight: 32, justifyContent: "center", marginTop: 4 }}
                                      >
                                        <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "600" }]} numberOfLines={1}>
                                          View {file} ↗
                                        </Text>
                                      </TouchableOpacity>
                                    )}
                                    {!!check && (
                                      <Text style={[typography.caption, { color: colors.riskHigh, marginTop: 4 }]}>
                                        Failing check: {check}
                                      </Text>
                                    )}
                                  </View>
                                </View>
                              );
                            })}
                        </View>

                        {detail.risk.quality?.needsCloserLook && (
                          <View
                            style={{
                              flexDirection: "row",
                              alignItems: "center",
                              gap: 8,
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              backgroundColor: colors.surfaceElevated,
                              borderRadius: radius.md,
                              borderWidth: 1,
                              borderColor: colors.border,
                              marginTop: 8,
                            }}
                          >
                            <Icon name="eye-outline" size={16} color={colors.textSecondary} />
                            <Text style={[typography.footnote, { color: colors.textSecondary, flex: 1 }]}>
                              {detail.risk.quality.reasons.join(" · ")}
                            </Text>
                          </View>
                        )}

                        <TouchableOpacity accessibilityRole="button" accessibilityLabel="How this was assessed" accessibilityState={{ expanded: assessmentOpen }} aria-expanded={assessmentOpen} onPress={() => setAssessmentOpen((open) => !open)} style={{ flexDirection: "row", alignItems: "center", gap: 8, minHeight: 44, padding: 12, marginTop: 12, backgroundColor: colors.surfaceElevated, borderRadius: 12 }}><Icon name="information-circle-outline" size={18} color={colors.brandLight} /><Text style={[typography.footnote, { color: colors.textSecondary, flex: 1 }]}>How this was assessed</Text><Icon name={assessmentOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.textSecondary} /></TouchableOpacity>
                        {assessmentOpen && <Text style={[typography.footnote, { color: colors.textSecondary, padding: 12 }]}>{riskAssessmentText(detail.risk.assessedBy)}</Text>}
                      </View>
                    )}

</>;
}
