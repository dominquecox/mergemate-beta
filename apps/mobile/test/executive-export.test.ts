import {describe,it,expect} from 'vitest';
import {executiveBrief,safeExecutiveText} from '../src/workspace/executiveExport';
describe('morning executive export',()=>{
 it('exports actual successful entries, selected lanes and observed elapsed time',()=>{const text=executiveBrief([{prRef:'org/repo#7',title:'Scaffold Worker',agent:'Jules',level:'safe',lane:'ignore'},{prRef:'org/repo#412',title:'Auth change',agent:'Claude',level:'blocked',lane:'needs_you'}],12.6);expect(text).toContain('PR #412');expect(text).toContain('Blocked');expect(text).toContain('13s');expect(text).toContain('2 successfully triaged');expect(text).not.toContain('45s');});
 it('scrubs credentials and formatting from exported titles without losing risk status',()=>{const text=executiveBrief([{prRef:'o/r#9',title:'Bearer private_fixture',agent:'[fake](https://evil.test)',level:'caution',lane:'fyi'}],NaN);expect(text).not.toContain('private_fixture');expect(text).not.toContain('https://evil.test');expect(text).toContain('Review on Desktop');expect(text).toContain('0s');expect(safeExecutiveText('password=secret_fixture')).not.toContain('secret_fixture');});
});
