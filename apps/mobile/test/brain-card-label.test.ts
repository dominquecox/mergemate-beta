import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { shortCardId } from '../src/brain/cardLabel';

describe('card id label', () => {
  it('cuts a UUID to its first block and keeps short ids', () => {
    expect(shortCardId('3f2a9c1e-5b7d-4c2a-9e10-a1b2c3d4e5f6')).toBe('3f2a9c1e');
    expect(shortCardId('MM-141')).toBe('MM-141');
    expect(shortCardId('x'.repeat(40))).toBe(`${'x'.repeat(16)}…`);
  });

  it('shows the title as the primary text on the row and in the detail header, with the id as small copyable text', () => {
    const screens = fs.readFileSync(path.resolve(__dirname, '../src/brain/screens.tsx'), 'utf8');
    expect(screens).toMatch(/modalTitle\}[^>]*>\{card\.title\}/);
    expect(screens).not.toMatch(/modalTitle\}>\{card\.id\}/);
    expect(screens).toContain('accessibilityLabel={card.title}');
    expect(screens).toContain('<CardIdLine id={card.id} />');
    expect(screens).toContain('<Text selectable style={styles.idText}');
  });
});
