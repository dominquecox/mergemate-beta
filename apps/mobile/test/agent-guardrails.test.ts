import {describe,it,expect} from 'vitest';
import {scanAgentGuardrails,guardrailCoverage} from '../src/workspace/agentGuardrails';
import {getExecutiveVerdict} from '../src/workspace/executiveVerdict';
import type {PrFile} from '../src/types';
const file=(patch:string,extra:Partial<PrFile>={}):PrFile=>({filename:'src/auth/service.ts',status:'modified',additions:1,deletions:1,patchSnippet:patch,...extra});
describe('agent failure-mode heuristics',()=>{
 it('checks package roots against known dependency keys, not subpaths or builtins',()=>{const findings=scanAgentGuardrails([file("@@ -1 +1 @@\n+import x from 'invented-sdk/client';\n+const fs=require('node:fs');\n+import y from '@scope/known/sub';\n+import z from './local';",{dependencyNames:['@scope/known']})]);expect(findings.map(f=>f.type)).toEqual(['ghost_dependency']);expect(findings[0]?.line).toBe(1);});
 it('does not claim a ghost dependency when no complete manifest is available',()=>{const files=[file("+import x from 'not-in-context'")];expect(scanAgentGuardrails(files)).toEqual([]);expect(guardrailCoverage(files).dependenciesKnown).toBe(false);});
 it('can read complete added package manifests but not partial invalid JSON',()=>{const manifest=file('+{"dependencies":{"real":"1"}}',{filename:'package.json',status:'added'});expect(scanAgentGuardrails([manifest,file("+const x=require('ghost')")])[0]?.type).toBe('ghost_dependency');expect(scanAgentGuardrails([file('+"real":"1",',{filename:'package.json'}),file("+require('ghost')")])).toEqual([]);});
 it('flags production mock shortcuts but excludes tests, demo and fixture files',()=>{expect(scanAgentGuardrails([file('+return { status: 200 };')])[0]?.type).toBe('mock_creep');for(const path of ['src/demo/fake.ts','test/auth.test.ts','src/github.fixtures.ts'])expect(scanAgentGuardrails([file('+// mock for test',{filename:path})])).toEqual([]);});
 it('flags removed/commented guards and wildcard policies, not math or ordinary globs',()=>{const findings=scanAgentGuardrails([file("@@ -8 +8 @@\n-requireAuth(ctx);\n+// verifyToken(user);\n+const permissions = ['*'];\n+const n = a * b;\n+const include = '**/*';")]);expect(findings.map(f=>f.type)).toEqual(['guard_deletion','guard_deletion','wildcard_permission']);expect(findings[0]?.line).toBe(8);});
 it('recognizes network and public Firebase rules',()=>{for(const line of ['+cidr: 0.0.0.0/0','+allow read, write: if true;'])expect(scanAgentGuardrails([file(line,{filename:'config/firestore.rules'})])[0]?.type).toBe('wildcard_permission');});
 it('escalates findings without replacing high-risk checks with a clean claim',()=>{expect(getExecutiveVerdict({files:[file('-authenticate(req)')]}).level).toBe('blocked');expect(guardrailCoverage([file('+ok',{patchState:'partial'})]).complete).toBe(false);});
});
