import React,{useState,useEffect,useRef,useCallback} from 'react';
import {View,TextInput,FlatList,Pressable,Platform,StyleSheet} from 'react-native';
import {useRouter,useFocusEffect} from 'expo-router';
import type {PrSearchFilters,PrSearchItem} from '@mergemate/contracts';
import {useAuth} from '../src/context/AuthContext';
import {useTheme} from '../src/context/ThemeContext';
import {useAndroidBackHandler,androidRipple} from '../src/platform/android';
import {StorageService} from '../src/storage';
import {Text} from '../src/components/Text';
import {Button} from '../src/components/Button';
import {Header} from '../src/components/Header';
import {StatusPill} from '../src/components/StatusPill';
import {RiskBadge} from '../src/components/RiskBadge';
import {EmptyState} from '../src/components/EmptyState';
import {ErrorState} from '../src/components/ErrorState';
import {LoadingState} from '../src/components/LoadingState';
import {usePrSearch} from '../src/hooks/usePrSearch';
const empty:PrSearchFilters={query:'',repo:'',author:'',risk:'all'};
export default function SearchScreen(){const {user}=useAuth();return user?<SearchWorkspace key={user.id} account={user.id}/>:<LoadingState title="Checking your session..." message="Verifying access before searching."/>;}
function SearchWorkspace({account}:{account:string}){
 const router=useRouter(),{colors,typography,spacing,radius}=useTheme();const [filters,setFilters]=useState<PrSearchFilters>(empty),[recent,setRecent]=useState<string[]>([]);
 const {items,loading,busy,error,hasMore,meta,refresh,more}=usePrSearch(filters);
 const list=useRef<FlatList<PrSearchItem>>(null),offset=useRef(0),focused=useRef(false),mounted=useRef(true);
 useEffect(()=>{void StorageService.getRecentSearches(account).then(values=>{if(mounted.current)setRecent(values);});return()=>{mounted.current=false;};},[account]);
 useFocusEffect(useCallback(()=>{focused.current=true;const frame=requestAnimationFrame(()=>{list.current?.recordInteraction();list.current?.scrollToOffset({offset:offset.current,animated:false});const node:unknown=list.current?.getScrollableNode();if(Platform.OS==='web'&&typeof HTMLElement!=='undefined'&&node instanceof HTMLElement)node.dispatchEvent(new Event('scroll'));});return()=>{focused.current=false;cancelAnimationFrame(frame);};},[]));
 const change=(key:keyof PrSearchFilters,value:string)=>{offset.current=0;setFilters(old=>({...old,[key]:value}));};
 useAndroidBackHandler(()=>{if(filters.query){change('query','');return true;}return false;},!!filters.query);
 const remember=async()=>{await StorageService.addRecentSearch(filters.query,account);const values=await StorageService.getRecentSearches(account);if(mounted.current)setRecent(values);};
 const input=(key:'query'|'repo'|'author'|'from'|'to',label:string,placeholder:string)=> <View style={{flex:1,minWidth:key==='query'?240:140}}><Text style={[typography.caption,{color:colors.textSecondary}]}>{label}</Text><TextInput accessibilityLabel={label} value={filters[key]??''} onChangeText={value=>change(key,value)} onSubmitEditing={remember} maxLength={key==='repo'?200:key==='author'?100:key==='from'||key==='to'?10:120} autoCapitalize="none" autoCorrect={false} placeholder={placeholder} placeholderTextColor={colors.textMuted} style={[styles.input,{color:colors.text,borderColor:colors.border,backgroundColor:colors.surfaceElevated,borderRadius:radius.md}]}/></View>;
 return <View style={{flex:1,backgroundColor:colors.background}}><Header title="Search & Filters" showBack/>
  <View style={{padding:spacing.base,gap:8}}>
   {input('query','Search PR titles','Title words (up to eight)')}
   <View style={styles.row}>{input('repo','Repository','owner/repository')}{input('author','Author','GitHub username')}</View>
   <View style={styles.row}>{input('from','Updated from (UTC)','YYYY-MM-DD')}{input('to','Updated through (UTC)','YYYY-MM-DD')}</View>
   <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Saved risk filter">{(['all','high','medium','low','unassessed'] as const).map(risk=><Pressable key={risk} accessibilityRole="radio" aria-checked={filters.risk===risk} accessibilityState={{checked:filters.risk===risk}} accessibilityLabel={`Filter by ${risk} risk`} onPress={()=>change('risk',risk)} style={[styles.chip,{backgroundColor:filters.risk===risk?colors.brand:colors.surfaceElevated,borderColor:colors.border,borderRadius:radius.full}]}><Text style={{color:filters.risk===risk?'#fff':colors.textSecondary,textTransform:'capitalize'}}>{risk}</Text></Pressable>)}</View>
   <Text style={[typography.caption,{color:colors.textSecondary}]}>Open PRs you can access. Risk filters use saved analysis for the current commit; search never runs analysis.</Text>
   <View style={styles.row}><Button title="Clear filters" variant="ghost" onPress={()=>{offset.current=0;setFilters(empty);}}/><Button title="Refresh search" variant="ghost" onPress={()=>void refresh()} disabled={busy}/><Button title="Save recent search" variant="ghost" onPress={remember} disabled={!filters.query.trim()}/></View>
   {recent.length>0&&!filters.query&&<View><Text style={[typography.caption,{color:colors.textSecondary}]}>Recent searches · this session only</Text><View style={styles.row}>{recent.map(term=><Button key={term} title={term} accessibilityLabel={`Search for ${term}`} variant="secondary" onPress={()=>change('query',term)}/>)}<Button title="Clear recent searches" variant="ghost" onPress={()=>{void StorageService.clearRecentSearches(account);setRecent([]);}}/></View></View>}
  </View>
  {loading?<LoadingState title="Searching pull requests..." message="Checking accessible results with your filters."/>:error&&items.length===0&&!hasMore?<ErrorState title="Couldn't load search results" message={error} onRetry={()=>void refresh()}/>:<FlatList ref={list} data={items} keyExtractor={row=>row.id} initialNumToRender={8} maxToRenderPerBatch={8} windowSize={5} onScroll={event=>{if(focused.current)offset.current=event.nativeEvent.contentOffset.y;}} scrollEventThrottle={16} contentContainerStyle={{paddingHorizontal:spacing.base,paddingBottom:60}}
   onEndReached={()=>{if(!error&&items.length)void more();}} onEndReachedThreshold={0.4}
   ListHeaderComponent={<View style={{gap:8,paddingBottom:12}}><Text accessibilityLiveRegion="polite" style={[typography.headline,{color:colors.text}]}>Results · {items.length} loaded</Text><Text style={[typography.caption,{color:colors.textSecondary}]}>{meta.candidates} candidates checked. Each page checks up to 20 PRs.</Text>{meta.incomplete&&<Text accessibilityRole="alert" style={{color:colors.textSecondary}}>GitHub returned incomplete results. Refresh or narrow your filters.</Text>}{meta.capped&&<Text style={{color:colors.textSecondary}}>GitHub search stops at 1,000 candidates. Narrow your filters to check beyond that limit.</Text>}{error&&<Text accessibilityRole="alert" style={{color:colors.riskHigh}}>{error}</Text>}</View>}
   ListEmptyComponent={<EmptyState icon="search-outline" title={hasMore?'More results can be checked':'No matching pull requests'} message={hasMore?'No matches among these candidates. Continue to the next page.':meta.incomplete||meta.capped?'No matches in the available results. Narrow your filters or refresh.':'Try another title, repository, author, risk or date filter.'}/>}
   ListFooterComponent={hasMore?<Button title={error?'Retry loading results':'Load more results'} loading={busy} onPress={()=>void more()}/>:undefined}
   renderItem={({item})=><Pressable android_ripple={androidRipple()} onPress={()=>{const [owner,repo]=item.repo.split('/');router.push(`/pr/${owner}/${repo}/${item.number}`);}} accessibilityRole="button" accessibilityLabel={`Open pull request ${item.title} in ${item.repo}`} style={[styles.card,{backgroundColor:colors.surface,borderColor:colors.border,borderRadius:radius.md}]}><View style={styles.row}><Text style={[typography.caption,{color:colors.textMuted}]}>#{item.number} · {item.repo}</Text>{item.risk&&<RiskBadge level={item.risk} compact/>}</View><Text style={[typography.headline,{color:colors.text,marginVertical:8}]}>{item.title}</Text><View style={styles.row}><StatusPill status={item.status}/><Text style={{color:colors.textSecondary}}>By @{item.author} · {item.updatedAt.slice(0,10)} UTC</Text></View></Pressable>}/>}</View>;
}
const styles=StyleSheet.create({row:{flexDirection:'row',flexWrap:'wrap',gap:8,alignItems:'center'},input:{borderWidth:1,minHeight:44,paddingHorizontal:12,marginTop:4},chip:{minHeight:44,paddingHorizontal:12,justifyContent:'center',borderWidth:1},card:{padding:16,borderWidth:1,marginBottom:12}});
