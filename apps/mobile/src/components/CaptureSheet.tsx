import React from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '../context/ThemeContext';
import { useFeatureFlags } from '../hooks/useFeatureFlags';
import { Icon, type IconName } from './Icon';
import { Text } from './Text';

/** Capture: three separate actions. Each opens its own screen, and every capture belongs to a board. */
export function CaptureSheet({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId?: string }) {
  const { colors, typography } = useTheme();
  const router = useRouter();
  const flags = useFeatureFlags();
  const query = projectId ? `?project=${encodeURIComponent(projectId)}` : '';
  const choices: { icon: IconName; label: string; detail: string; href: string; show: boolean }[] = [
    { icon: 'image-outline', label: 'Screenshot insight', detail: 'AI reviews a screenshot; add the findings to a board.', href: `/capture/screenshot${query}`, show: !!flags.highlight },
    { icon: 'mic-outline', label: 'Voice note', detail: 'Record, transcribe and add it to a board or a card.', href: `/capture/voice${query}`, show: !!flags.voice_notes },
    { icon: 'create-outline', label: 'Text note', detail: 'Write a note for a board or a card.', href: `/capture/note${query}`, show: true },
  ];
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Pressable accessible={false} importantForAccessibility="no" aria-hidden onPress={onClose} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11, 15, 23, 0.6)' }} />
        <View accessibilityViewIsModal style={{ backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, gap: 8, width: '100%', maxWidth: 520, alignSelf: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Capture</Text>
            <Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close capture" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="close" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>
          {choices.filter((choice) => choice.show).map((choice) => (
            <Pressable key={choice.label} accessibilityRole="button" accessibilityLabel={choice.label} accessibilityHint={choice.detail}
              onPress={() => { onClose(); router.push(choice.href as never); }}
              style={({ pressed }) => ({ minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: pressed ? colors.surfaceElevated : colors.background })}>
              <Icon name={choice.icon} size={22} color={colors.brandLight} />
              <View style={{ flex: 1 }}>
                <Text style={[typography.body, { color: colors.text, fontWeight: '600' }]}>{choice.label}</Text>
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{choice.detail}</Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    </Modal>
  );
}
