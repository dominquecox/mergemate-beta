import React, { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, View } from "react-native";
import { useRouter } from "expo-router";
import { api } from "../api";
import { ApiClientError } from "../api/errors";
import type { PublicPost } from "../types";
import { useTheme } from "../context/ThemeContext";
import { Text } from "./Text";
import { Header } from "./Header";
import { Section } from "./ScreenDesign";
import { Button } from "./Button";
import { LoadingState } from "./LoadingState";
import { ErrorState } from "./ErrorState";
import { EmptyState } from "./EmptyState";

const publicError = (error:unknown) => error instanceof ApiClientError && error.code==='rate_limited'
  ? 'Too many requests. Wait a moment and try again.' : 'Published updates are unavailable. Try again.';

export function PublicPostList({type}:{type:"news"|"changelog"}) {
  const {colors,typography,spacing}=useTheme();const router=useRouter();
  const [posts,setPosts]=useState<PublicPost[]>([]);const [next,setNext]=useState<string|null>(null);
  const [loading,setLoading]=useState(true);const [more,setMore]=useState(false);const [error,setError]=useState<string|null>(null);
  const generation=useRef(0);const lock=useRef(false);const [retryCursor,setRetryCursor]=useState<string|undefined>();
  const load=useCallback(async(cursor?:string)=>{
    if(lock.current)return;lock.current=true;const n=++generation.current;
    if(cursor)setMore(true);else setLoading(true);setError(null);
    try {
      const page=await api.getPublicPostPage(type,cursor);
      if(n!==generation.current)return;
      setPosts(current=>{const seen=new Set<string>();return [...(cursor?current:[]),...page.items].filter(post=>{if(seen.has(post.slug))return false;seen.add(post.slug);return true;});});setNext(page.nextCursor);
    }catch(e){if(n===generation.current){setRetryCursor(cursor);setError(publicError(e));}}
    finally{if(n===generation.current){setLoading(false);setMore(false);lock.current=false;}}
  },[type]);
  useEffect(()=>{void load();return()=>{generation.current++;lock.current=false;};},[load]);
  return <View style={{flex:1,backgroundColor:colors.background}}>
    <Header title={type==='news'?'Product News':'Changelog'} showBack/>
    {loading?<LoadingState title="Loading published updates..." message="Fetching the latest published posts."/>:
      error&&posts.length===0?<ErrorState title="Couldn't load updates" message={error} onRetry={()=>void load()}/>:
      posts.length===0?<EmptyState icon="newspaper-outline" title="No published updates" message="There are no published posts in this section." actionTitle="Refresh" onAction={()=>void load()}/>:
      <ScrollView contentContainerStyle={{padding:spacing.base,paddingBottom:60,gap:spacing.md}}>
        {posts.map(post=><Section key={post.slug}>
          <Text style={[typography.caption,{color:colors.brandLight}]}>{post.date}</Text>
          <Text accessibilityRole="header" style={[typography.title2,{color:colors.text,marginTop:4}]}>{post.title}</Text>
          <Text style={[typography.body,{color:colors.textSecondary,marginVertical:12}]}>{post.summary}</Text>
          <Button title="Read full post" accessibilityLabel={`Read full post: ${post.title}`} onPress={()=>router.push(`/posts/${post.slug}` as never)}/>
        </Section>)}
        {error?<ErrorState title={retryCursor?"Couldn't load more updates":"Couldn't refresh updates"} message={error} onRetry={()=>void load(retryCursor)}/>:null}
        {next?<Button title={more?'Loading more...':'Load more updates'} disabled={more} onPress={()=>void load(next)}/>:null}
        <Button title="Refresh updates" variant="secondary" onPress={()=>void load()}/>
      </ScrollView>}
  </View>;
}

export function PublicPostDetail({slug}:{slug:string}) {
  const {colors,typography,spacing}=useTheme();const router=useRouter();
  const [post,setPost]=useState<PublicPost|null>(null);const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);const [missing,setMissing]=useState(false);const generation=useRef(0);
  const load=useCallback(async()=>{
    const n=++generation.current;setLoading(true);setError(null);setMissing(false);setPost(null);
    try{const value=await api.getPublicPost(slug);if(n===generation.current)setPost(value);}
    catch(e){if(n===generation.current){if(e instanceof ApiClientError&&e.code==='not_found')setMissing(true);else setError(publicError(e));}}
    finally{if(n===generation.current)setLoading(false);}
  },[slug]);
  useEffect(()=>{void load();return()=>{generation.current++;};},[load]);
  return <View style={{flex:1,backgroundColor:colors.background}}>
    <Header title={post?.type==='changelog'?'Changelog':'Product News'} showBack/>
    {loading?<LoadingState title="Loading full post..." message="Fetching the published content."/>:
      missing?<EmptyState icon="document-text-outline" title="Post unavailable" message="This post isn't published or is no longer available." actionTitle="Browse news" onAction={()=>router.replace('/news')}/>:
      error?<ErrorState title="Couldn't load this post" message={error} onRetry={()=>void load()}/>:
      post?<ScrollView contentContainerStyle={{padding:spacing.base,paddingBottom:60}}><Section>
        <Text style={[typography.caption,{color:colors.brandLight}]}>{post.date}</Text>
        <Text accessibilityRole="header" style={[typography.title1,{color:colors.text,marginVertical:12}]}>{post.title}</Text>
        <Text selectable style={[typography.body,{color:colors.textSecondary,lineHeight:26}]}>{post.content}</Text>
        <Button title={post.type==='news'?'Back to news':'Back to changelog'} variant="secondary" style={{marginTop:spacing.lg}} onPress={()=>router.replace(post.type==='news'?'/news':'/changelog')}/>
      </Section></ScrollView>:null}
  </View>;
}
