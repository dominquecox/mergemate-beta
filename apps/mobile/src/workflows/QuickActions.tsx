import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, TextInput, View } from 'react-native';
import type { WorkflowDefinition, WorkflowRun } from '@mergemate/contracts';
import { useTheme } from '../context/ThemeContext';
import { Text } from '../components/Text';
import { Icon, type IconName } from '../components/Icon';
import { Button } from '../components/Button';
import { displayRunStatus } from './agent-model';
import type { useAgentWorkspace } from './useAgentWorkspace';

import { matchRuns, formatRunTime } from './quick-actions-model';

type Capabilities = NonNullable<ReturnType<typeof useAgentWorkspace>['capabilities']>;

export interface QuickActionsProps {
  definitions: WorkflowDefinition[];
  definitionsLoading: boolean;
  definitionsError: string;
  runs: WorkflowRun[];
  historyLoading: boolean;
  historyError: string;
  capabilities: Capabilities | null;
  capabilityLoading: boolean;
  capabilityError: string;
  codingEnabled: boolean;
  configured: boolean;
  busy: boolean;
  deleting: boolean;
  activeDefinitionId?: string;
  pendingDelete: string | null;
  onOpenSaved: (definition: WorkflowDefinition) => void;
  onRequestDelete: (id: string) => void;
  onCancelDelete: () => void;
  onConfirmDelete: (id: string) => void;
  /** Starter templates offered in the Templates menu; choosing one loads it into the composer. */
  templates: ReadonlyArray<{ id: string; name: string; description: string; mode: string }>;
  onUseTemplate: (id: string) => void;
  onOpenRun: (run: WorkflowRun) => void;
}

type Open = null | 'saved' | 'runs' | 'templates' | 'capabilities';


/** Four small buttons under the page title. Each opens a layer that closes on Escape or an outside click and returns focus to its button. */
export function QuickActions(props: QuickActionsProps) {
  const { colors, typography, radius } = useTheme();
  const [open, setOpen] = useState<Open>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number } | null>(null);
  const [search, setSearch] = useState('');
  const buttons = useRef<Record<'saved' | 'runs' | 'templates' | 'capabilities', React.ElementRef<typeof Pressable> | null>>({ saved: null, runs: null, templates: null, capabilities: null });

  const show = (which: Exclude<Open, null>) => {
    if (which === 'saved' || which === 'templates') {
      const node = buttons.current[which] as unknown as { measureInWindow?: (cb: (x: number, y: number, w: number, h: number) => void) => void } | null;
      node?.measureInWindow?.((x, y, _w, h) => setAnchor({ x, y: y + h + 4 }));
    }
    setSearch('');
    setOpen(which);
  };

  const { pendingDelete, onCancelDelete } = props;
  const close = useCallback(() => {
    const which = open;
    setOpen(null);
    // Closing the Saved menu drops a half-confirmed delete, so it is not still waiting when the menu reopens.
    if (which === 'saved' && pendingDelete) onCancelDelete();
    if (which) {
      requestAnimationFrame(() => (buttons.current[which] as unknown as { focus?: () => void } | null)?.focus?.());
    }
  }, [open, pendingDelete, onCancelDelete]);

  const visibleRuns = useMemo(() => matchRuns(props.runs, search), [props.runs, search]);

  const trigger = (which: Exclude<Open, null>, label: string, accessibilityLabel: string, icon?: IconName) => (
    <Pressable
      ref={(node) => { buttons.current[which] = node; }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ expanded: open === which }}
      aria-haspopup={which === 'saved' || which === 'templates' ? 'menu' : 'dialog'}
      onPress={() => show(which)}
      style={({ pressed }) => ({
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: 12,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: open === which ? colors.brandLight : colors.border,
        backgroundColor: colors.surface,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {icon ? <Icon name={icon} size={16} color={colors.textSecondary} /> : null}
      {label ? <Text style={[typography.caption, { color: colors.text, fontWeight: '600' }]}>{label}</Text> : null}
    </Pressable>
  );

  const layer = {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.brandMuted,
    padding: 14,
    gap: 10,
  };

  return (
    <>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
        {trigger('saved', `Saved (${props.definitions.length})`, `Saved workflows, ${props.definitions.length}`)}
        {trigger('runs', `Recent runs (${props.runs.length})`, `Recent runs, ${props.runs.length}`)}
        {trigger('templates', 'Templates', 'Templates')}
        {trigger('capabilities', 'Capabilities', 'Capabilities', 'information-circle-outline')}
      </View>

      <Modal visible={open === 'saved'} transparent animationType="fade" onRequestClose={close}>
        <View style={{ flex: 1 }}>
          <Pressable accessible={false} importantForAccessibility="no" aria-hidden onPress={close} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
          <View
            accessibilityViewIsModal
            style={[layer, { position: 'absolute', left: Math.max(8, anchor?.x ?? 22), top: anchor?.y ?? 120, width: 360, maxWidth: '94%', maxHeight: 420 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text accessibilityRole="header" style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>Saved workflows</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close saved workflows" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 6 }}>
              {props.definitionsLoading ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading saved workflows...</Text>
              ) : props.definitionsError ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.statusAlert }]}>{props.definitionsError}</Text>
              ) : props.definitions.length === 0 ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Save a workflow to reuse it across sessions.</Text>
              ) : (
                props.definitions.map((value) => (
                  <View
                    key={value.id}
                    style={{
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: props.activeDefinitionId === value.id ? colors.brandLight : colors.border,
                      backgroundColor: colors.surfaceElevated,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Pressable
                        accessibilityRole="menuitem"
                        accessibilityLabel={`Load saved workflow ${value.name}`}
                        disabled={props.busy}
                        onPress={() => {
                          props.onOpenSaved(value);
                          close();
                        }}
                        style={{ flex: 1, minHeight: 44, paddingHorizontal: 10, justifyContent: 'center' }}
                      >
                        <Text numberOfLines={1} style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>{value.name}</Text>
                        <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary }]}>{value.target.owner}/{value.target.repo}</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Delete saved workflow ${value.name}`}
                        disabled={props.busy}
                        onPress={() => props.onRequestDelete(value.id ?? '')}
                        style={{ width: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                      >
                        <Icon name="trash-outline" size={17} color={colors.textSecondary} />
                      </Pressable>
                    </View>
                    {props.pendingDelete === value.id && (
                      <View style={{ padding: 10, gap: 6 }}>
                        <Text style={[typography.caption, { color: colors.textSecondary }]}>
                          Delete this saved definition? Existing runs will not be cancelled or removed.
                        </Text>
                        <Button title="Confirm delete workflow" variant="destructive" loading={props.deleting} disabled={props.busy} onPress={() => props.onConfirmDelete(value.id!)} />
                        <Button title="Keep saved workflow" variant="ghost" disabled={props.busy} onPress={props.onCancelDelete} />
                      </View>
                    )}
                  </View>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={open === 'templates'} transparent animationType="fade" onRequestClose={close}>
        <View style={{ flex: 1 }}>
          <Pressable accessible={false} importantForAccessibility="no" aria-hidden onPress={close} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
          <View
            accessibilityViewIsModal
            style={[layer, { position: 'absolute', left: Math.max(8, anchor?.x ?? 22), top: anchor?.y ?? 120, width: 360, maxWidth: '94%', maxHeight: 420 }]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text accessibilityRole="header" style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>Templates</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close templates" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 6 }}>
              {props.templates.map((template) => (
                <Pressable
                  key={template.id}
                  accessibilityRole="menuitem"
                  accessibilityLabel={`Use ${template.name} template`}
                  disabled={props.busy}
                  onPress={() => {
                    props.onUseTemplate(template.id);
                    close();
                  }}
                  style={{ minHeight: 44, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, justifyContent: 'center' }}
                >
                  <Text numberOfLines={1} style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>{template.name}</Text>
                  <Text numberOfLines={2} style={[typography.caption, { color: colors.textSecondary }]}>
                    {template.mode === 'review' ? 'Review' : 'Coding'} · {template.description}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={open === 'runs'} transparent animationType="fade" onRequestClose={close}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Pressable accessible={false} importantForAccessibility="no" aria-hidden onPress={close} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11, 15, 23, 0.72)' }} />
          <View accessibilityViewIsModal style={[layer, { width: '100%', maxWidth: 480, maxHeight: 520 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Recent runs</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close recent runs" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <TextInput
              accessibilityLabel="Search recent runs"
              value={search}
              onChangeText={setSearch}
              autoFocus
              placeholder="Search by name or status"
              placeholderTextColor={colors.textMuted}
              style={{ minHeight: 44, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.borderLight, color: colors.text, backgroundColor: colors.surfaceElevated, fontSize: 13 }}
            />
            <ScrollView contentContainerStyle={{ gap: 6 }}>
              {props.historyLoading ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Loading runs...</Text>
              ) : props.historyError ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.statusAlert }]}>{props.historyError}</Text>
              ) : visibleRuns.length === 0 ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>{props.runs.length ? 'No runs match your search.' : 'No execution receipts loaded yet.'}</Text>
              ) : (
                visibleRuns.map((run) => (
                  <Pressable
                    key={run.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open run ${run.definition.name}`}
                    disabled={props.busy}
                    onPress={() => {
                      setOpen(null);
                      props.onOpenRun(run);
                    }}
                    style={{ minHeight: 54, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surfaceElevated, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={[typography.subhead, { color: colors.text, fontWeight: '600' }]}>{run.definition.name}</Text>
                      <Text numberOfLines={1} style={[typography.caption, { color: colors.textSecondary }]}>
                        {displayRunStatus(run.status)} · {formatRunTime(run.updatedAt ?? run.createdAt)}
                      </Text>
                    </View>
                    <Icon name="chevron-forward" size={15} color={colors.textMuted} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <Modal visible={open === 'capabilities'} transparent animationType="fade" onRequestClose={close}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <Pressable accessible={false} importantForAccessibility="no" aria-hidden onPress={close} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(11, 15, 23, 0.72)' }} />
          <View accessibilityViewIsModal style={[layer, { width: '100%', maxWidth: 460, maxHeight: 520 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text accessibilityRole="header" style={[typography.headline, { color: colors.text }]}>Capabilities</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Close capabilities" onPress={close} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="close" size={18} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ gap: 10 }}>
              {!props.configured ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  Real model generation and runs need a signed-in connection to the workflow API. Demo mode does not simulate agent execution.
                </Text>
              ) : props.capabilityLoading ? (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>Checking this repository...</Text>
              ) : props.capabilityError ? (
                <Text accessibilityRole="alert" style={[typography.caption, { color: colors.statusAlert }]}>{props.capabilityError}</Text>
              ) : props.capabilities ? (
                <>
                  <CapabilityRow icon="analytics-outline" title="Analysis runtime" available={props.capabilities.analysis.available} reason={props.capabilities.analysis.reason} />
                  {props.codingEnabled && (
                    <CapabilityRow icon="construct-outline" title="Coding executor" available={props.capabilities.coding.available} reason={props.capabilities.coding.reason} />
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Icon name="speedometer-outline" size={18} color={colors.textSecondary} />
                    <Text style={[typography.caption, { color: colors.textSecondary }]}>
                      Limits: {props.capabilities.limits.maxFiles} changed files · {props.capabilities.limits.maxSteps} workflow steps
                    </Text>
                  </View>
                </>
              ) : (
                <Text style={[typography.caption, { color: colors.textSecondary }]}>
                  Add a repository target to check the actual model, queue and executor configuration.
                </Text>
              )}
              <Text style={[typography.caption, { color: colors.textSecondary }]}>
                Coding needs a configured isolated executor and repository write authorization. Existing connection scopes are not silently expanded.
              </Text>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </>
  );
}

function CapabilityRow({ icon, title, available, reason }: { icon: IconName; title: string; available: boolean; reason?: string }) {
  const { colors, typography } = useTheme();
  const tone = available ? colors.statusGood : colors.statusWarning;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
      <Icon name={icon} size={18} color={tone} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={[typography.caption, { color: tone, fontWeight: '600' }]}>{title}: {available ? 'Ready' : 'Needs setup'}</Text>
        {!!reason && <Text style={[typography.caption, { color: colors.textSecondary }]}>{reason}</Text>}
      </View>
    </View>
  );
}
