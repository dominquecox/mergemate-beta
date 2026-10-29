import React, { useState,useMemo } from "react";
import { View, ScrollView, TouchableOpacity, StyleSheet } from "react-native";
import { Text } from "./Text";
import { useTheme } from "../context/ThemeContext";
import { parseDiff } from "./diffLines";

/** Unified diff that wraps long lines by default; the number and +/- columns stay fixed beside wrapped text. */
export function DiffView({patch,wrap:controlledWrap,onWrapChange}:{patch:string;wrap?:boolean;onWrapChange?:(wrap:boolean)=>void}) {
  const { colors, typography } = useTheme();
  const [localWrap,setLocalWrap]=useState(true),[visible,setVisible]=useState(400);const wrap=controlledWrap??localWrap;const setWrap=(value:boolean)=>{setLocalWrap(value);onWrapChange?.(value);};
  const lines=useMemo(()=>parseDiff(patch),[patch]);
  const code = [typography.code, { fontSize: 12, lineHeight: 18 }];
  const rows = (
    <View>
      {lines.slice(0,visible).map((line, index) => {
        const bg = line.kind === "add" ? colors.riskLowBg : line.kind === "del" ? colors.riskHighBg : "transparent";
        const fg = line.kind === "add" ? colors.riskLow : line.kind === "del" ? colors.riskHigh : colors.textMuted;
        return (
          <View key={index} style={[styles.row, { backgroundColor: bg }]}>
            <Text style={[code, styles.number, { color: colors.textMuted }]}>{line.number ?? ""}</Text>
            <Text style={[code, styles.marker, { color: fg }]}>{line.marker}</Text>
            <Text
              selectable
              style={[code, wrap ? styles.wrapText : styles.noWrapText, { color: line.kind === "hunk" ? colors.textMuted : colors.text }]}
            >
              {line.text || " "}
            </Text>
          </View>
        );
      })}
    </View>
  );
  return (
    <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
      <TouchableOpacity
        accessibilityRole="switch"
        accessibilityState={{ checked: wrap }}
        accessibilityLabel="Wrap long lines"
        aria-checked={wrap}
        onPress={() => setWrap(!wrap)}
        style={styles.toggle}
      >
        <Text style={[typography.caption, { color: colors.brandLight, fontWeight: "600" }]}>{wrap ? "Wrap: on" : "Wrap: off"}</Text>
      </TouchableOpacity>
      {wrap ? rows : <ScrollView horizontal>{rows}</ScrollView>}
      {lines.length>visible&&<View style={{padding:12}}><Text style={{color:colors.textSecondary}}>Showing {visible} of {lines.length} diff lines.</Text>{visible<2000?<TouchableOpacity accessibilityRole="button" accessibilityLabel="Show more diff lines" style={{minHeight:44,justifyContent:'center'}} onPress={()=>setVisible(value=>Math.min(2000,value+400))}><Text style={{color:colors.brandLight}}>Show more diff lines</Text></TouchableOpacity>:<Text style={{color:colors.textSecondary}}>Open this PR in GitHub to read the remaining lines.</Text>}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", paddingRight: 8 },
  number: { width: 44, textAlign: "right", paddingRight: 8 },
  marker: { width: 16, textAlign: "center" },
  wrapText: { flex: 1, flexShrink: 1,minWidth:0 },
  noWrapText: { flexShrink: 0 },
  toggle: { alignSelf: "flex-end", paddingHorizontal: 12, paddingVertical: 6, minHeight: 44, justifyContent: "center" },
});
