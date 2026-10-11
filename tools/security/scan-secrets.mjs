// Output paths and detector names only. Never print matched secret material.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
const patterns = [
 ['private-key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['service-account-json', /"type"\s*:\s*"service_account"/],
 ['private-key-json', /"private_key"\s*:\s*"[^"\s]{20}/],
 ['github-token', /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/]
];
let findings = [];
function inspect(name, content) {
 for (const [detector, pattern] of patterns) if (pattern.test(content)) findings.push({ path: name, detector });
}
const excluded = new Set(['.git','node_modules','.two-device-run','.cache']);
function walk(dir) {
 for (const entry of readdirSync(dir, { withFileTypes: true })) {
  if (excluded.has(entry.name) || entry.isSymbolicLink()) continue;
  const path = `${dir}/${entry.name}`;
  if (entry.isDirectory()) walk(path);
  else if (statSync(path).size < 10_000_000) inspect(path, readFileSync(path, 'utf8'));
 }
}
walk('.');
let objects = 0;
if (process.argv.includes('--history')) {
 const entries = execFileSync('git', ['rev-list', '--objects', '--all'], { maxBuffer: 100*1024*1024 }).toString().trim().split('\n');
 for (const line of entries) {
  const [oid, ...path] = line.split(' ');
  if (!path.length) continue;
  if (execFileSync('git',['cat-file','-t',oid]).toString().trim() !== 'blob') continue;
  objects++;
  inspect(`history:${oid}:${path.join(' ')}`, execFileSync('git',['cat-file','blob',oid], { maxBuffer:100*1024*1024 }).toString());
 }
}
console.log(JSON.stringify({ findings, historyBlobsScanned: objects, note:'Pattern scan only; no guarantee of absence. No secret values printed.' }, null, 2));
process.exitCode = findings.length ? 1 : 0;
