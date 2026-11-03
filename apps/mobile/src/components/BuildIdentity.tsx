import React from "react";
import * as Application from "expo-application";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { SettingsGroup, SettingsRow } from "./SettingsRows";
import { buildIdentityRows } from "../config/buildIdentity";

export function BuildIdentity() {
  const rows = buildIdentityRows({
    platform: Platform.OS,
    version: Application.nativeApplicationVersion,
    build: Application.nativeBuildVersion,
    commit: Constants.expoConfig?.extra?.buildCommit,
  });
  return <SettingsGroup title="About MergeMate">{rows.map((row, index) =>
    <SettingsRow key={row.label} first={index === 0} label={row.label} detail={row.detail} />
  )}</SettingsGroup>;
}
