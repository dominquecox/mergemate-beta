import React from "react";
import { useLocalSearchParams } from "expo-router";
import { PublicPostDetail } from "../../../src/components/PublicPostReader";
export default function PostScreen() {
  const {slug}=useLocalSearchParams<{slug?:string|string[]}>();
  return <PublicPostDetail slug={typeof slug==='string'?slug:''}/>;
}
