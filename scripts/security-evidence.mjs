export function assessBundle(platform, sources, findings) {
  if (!sources.length) throw new Error(`${platform} has no build inputs`);
  const normalized = sources.map(source => source.replaceAll('\\', '/'));
  return { platform, sourceCount: normalized.length,
    affectedPackages: findings.flatMap(finding => {
      const paths = finding.nodes.filter(node => normalized.some(source => source.includes(node.replaceAll('\\', '/') + '/')));
      return finding.advisories.length && paths.length ? [{ name: finding.name, severity: finding.severity, paths }] : [];
    }) };
}
export function hasUnknownHigh(findings) {
  return findings.filter(f => ['high', 'critical'].includes(f.severity)).some(finding =>
    !['expo', '@expo/cli', 'zod'].includes(finding.name) ||
    finding.advisories.some(advisory => advisory.url !== 'https://github.com/advisories/GHSA-mrhx-c7xc-m3w5'));
}
