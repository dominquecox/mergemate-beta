/** Friendly name for the `provider:model` label the API attaches to an AI result. Unknown labels show as given. */
export function modelDisplayName(label: string | undefined): string | null {
  if (!label) return null;
  if (label === "sample:demo") return "Sample data";
  const [provider = "", ...rest] = label.split(":");
  const id = rest.join(":");
  if (provider === "meta") {
    const spark = /^muse-spark-(\d+(?:\.\d+)*)$/.exec(id);
    if (spark) return `Meta Muse Spark ${spark[1]}`;
    const sam = /^sam-(\d+(?:\.\d+)*)$/.exec(id);
    if (sam) return `Meta SAM ${sam[1]}`;
    return `Meta ${id}`;
  }
  if (provider === "workers-ai") {
    if (id === "meta/muse-spark-open") return "Meta Muse Spark Open on Workers AI";
    if (id.includes("llama")) return "Meta Llama on Workers AI";
    if (id.includes("clef")) return "Cloudflare Clef";
    return `${id} on Workers AI`;
  }
  return label;
}
