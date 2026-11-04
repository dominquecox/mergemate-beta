import React, { useState } from "react";
import { Modal, Pressable, View } from "react-native";
import { Text } from "./Text";
import { Icon } from "./Icon";
import { useTheme } from "../context/ThemeContext";

export interface InfoTipProps {
  title: string;
  body: string;
  size?: number;
}

/**
 * Interactive (i) help tooltip button that opens a sleek informational popover/modal
 * on both desktop and mobile using the unified blue informational (`statusInfo`) scheme.
 */
export function InfoTip({ title, body, size = 15 }: InfoTipProps) {
  const { colors, typography, radius } = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Help: ${title}`}
        hitSlop={10}
        onPress={(e) => {
          e.stopPropagation?.();
          setOpen(true);
        }}
        style={({ pressed }) => ({
          minWidth: 24,
          minHeight: 24,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          opacity: pressed ? 0.75 : 1,
        })}
      >
        <Icon name="information-circle-outline" size={size} color={colors.statusInfo} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Close help dialog"
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            backgroundColor: "rgba(11, 15, 23, 0.72)",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation?.()}
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: colors.surface,
              borderRadius: radius.lg,
              borderWidth: 1,
              borderColor: colors.statusInfo,
              padding: 18,
              gap: 10,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
                <View
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 999,
                    backgroundColor: colors.statusInfoBg,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Icon name="information-circle" size={16} color={colors.statusInfo} />
                </View>
                <Text accessibilityRole="header" style={[typography.headline, { color: colors.text, flex: 1 }]}>
                  {title}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Dismiss help"
                onPress={() => setOpen(false)}
                style={{ minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" }}
              >
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <Text style={[typography.callout, { color: colors.textSecondary, lineHeight: 20 }]}>
              {body}
            </Text>
            <View style={{ flexDirection: "row", justifyContent: "flex-end", marginTop: 4 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Got it"
                onPress={() => setOpen(false)}
                style={({ pressed }) => ({
                  minHeight: 44,
                  paddingHorizontal: 14,
                  paddingVertical: 6,
                  borderRadius: radius.sm,
                  backgroundColor: colors.statusInfoBg,
                  borderWidth: 1,
                  borderColor: colors.statusInfo,
                  alignItems: "center",
                  justifyContent: "center",
                  opacity: pressed ? 0.85 : 1,
                })}
              >
                <Text style={[typography.caption, { color: colors.statusInfo, fontWeight: "700" }]}>Got it</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}
