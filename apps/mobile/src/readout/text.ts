const UNSAFE=/(?:https?:|www\.|<[^>]*>|`|\b(?:secrets?|passwords?|tokens?|credentials?|authorization|bearer|private.?key)\b|gh[pousr]_|github_pat_|sk-[A-Za-z0-9]|AKIA[A-Z0-9]|-----BEGIN|[A-Za-z0-9+/=_-]{32,}|[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}|\b(?:const|function|import|return|SELECT|INSERT)\s|\b[\w.-]+\/[\w./-]+|\b[\w.-]+\.(?:tsx?|jsx?|py|env|pem|go|rs|sql)\b|[{};])/i;
/** Only safe plain screen text; findings/code/URLs are excluded before formatting is removed. */
export function narrationSentences(parts:readonly string[]):string[]{
  return parts.flatMap(part=>part.slice(0,10_000).replace(/```[\s\S]*?```/g,' ').replace(/`[^`]*`/g,' ').split(/(?<=[.!?])\s+|\n+/))
    .filter(sentence=>!UNSAFE.test(sentence))
    .map(sentence=>sentence.replace(/[*_#>]/g,' ').replace(/\s+/g,' ').trim())
    .filter(sentence=>sentence.length>2 && sentence.length<=600).slice(0,80);
}
export function inboxNarration(items:readonly {kind:string}[]):string[]{
  const count=(kind:string)=>items.filter(item=>item.kind===kind).length;
  return narrationSentences([`Current inbox overview. ${items.length} loaded notifications. ${count('review')} review requests. ${count('mention')} mentions. ${count('mine')} updates to your pull requests.`]);
}
