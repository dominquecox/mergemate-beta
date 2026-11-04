#!/usr/bin/env node
import { createHmac,randomBytes } from 'node:crypto';

const encode=value=>Buffer.from(typeof value==='string'?value:JSON.stringify(value)).toString('base64url');
const [runnerId,repositories,generationValue='1',daysValue='7']=process.argv.slice(2),generation=Number(generationValue),days=Number(daysValue),secret=process.env.WORKFLOW_RUNNER_SIGNING_KEY;
if(!secret||secret.length<32||!runnerId||!/^[a-z\d_-]{1,100}$/i.test(runnerId)||!repositories||!Number.isInteger(generation)||generation<1||!Number.isInteger(days)||days<1||days>30)throw new Error('Usage: WORKFLOW_RUNNER_SIGNING_KEY=... node scripts/mint-runner-credential.mjs RUNNER_ID owner/repo[,owner/repo] GENERATION [1-30 days]');
const repos=[...new Set(repositories.split(',').map(value=>value.trim().toLowerCase()))];
if(!repos.length||repos.length>10||repos.some(repo=>!/^[a-z\d-]+\/[\w.-]+$/i.test(repo)))throw new Error('Provide one to ten valid owner/repository values.');
const now=Math.floor(Date.now()/1000),header=encode({alg:'HS256',typ:'MMR',kid:'v1'}),payload=encode({v:1,sub:runnerId,gen:generation,repositories:repos,iat:now,exp:now+days*86400,jti:randomBytes(18).toString('base64url')}),input=`${header}.${payload}`,signature=createHmac('sha256',secret).update(input).digest('base64url');
process.stdout.write(`${input}.${signature}\n`);
