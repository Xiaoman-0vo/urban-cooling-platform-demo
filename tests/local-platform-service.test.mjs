import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createServer } from 'node:http';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { serviceInfo, launchPlist, serverMatches, portOccupied, manageService } from '../scripts/local-platform-service.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(tmpdir(), '成都 平台 & '));
  await mkdir(path.join(root, 'public/data'), { recursive: true });
  await writeFile(path.join(root, 'public/data/manifest.json'), '{"original":true}\n');
  t.after(() => rm(root, { recursive: true, force: true }));
  return root;
}

async function listen(t, handler, port = 0) {
  const server = createServer(handler);
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
  t.after(() => { server.closeAllConnections(); return new Promise(resolve => server.close(resolve)); });
  return { server, url: `http://127.0.0.1:${server.address().port}` };
}

test('readiness requires identical manifest bytes and rejects wrong content, failures and timeouts', async t => {
  const root = await fixture(t);
  let mode = 'valid';
  const { url } = await listen(t, (request, response) => {
    if (mode === 'timeout') return;
    response.statusCode = mode === 'error' ? 503 : 200;
    response.end(mode === 'valid' ? '{"original":true}\n' : '{"another_app":true}');
  });
  assert.equal(await serverMatches(root, url), true);
  for (const next of ['wrong', 'error', 'timeout']) {
    mode = next;
    assert.equal(await serverMatches(root, url, 100), false, next);
  }
});

test('port detection finds a listener and leaves the listening server usable', async t => {
  const { url } = await listen(t, (request, response) => response.end('still running'));
  assert.equal(await portOccupied(url), true);
  assert.equal(await (await fetch(url)).text(), 'still running');
});

test('native plist parsing preserves Chinese and ampersand paths, with a loopback-only supervised process', { skip: process.platform !== 'darwin' }, async t => {
  const root = await fixture(t), info = serviceInfo(root);
  const config = path.join(root, 'service.plist');
  await writeFile(config, launchPlist(info));
  const parsed = spawnSync('/usr/bin/plutil', ['-convert', 'json', '-o', '-', config], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stderr);
  const job = JSON.parse(parsed.stdout);
  assert.equal(job.WorkingDirectory, root);
  assert.equal(job.ProgramArguments[1], path.join(root, 'node_modules/vite/bin/vite.js'));
  assert.deepEqual(job.ProgramArguments.slice(2), ['--host', '127.0.0.1', '--port', '4173', '--strictPort']);
  assert.equal(job.KeepAlive, true);
  assert.equal(path.dirname(info.plist), path.join(root, '.runtime'));
});

test('an occupied platform port refuses startup and stop does not terminate an unrelated service', { skip: process.platform !== 'darwin' }, async t => {
  // If a real app is already open, leave it untouched; the live reuse/restart
  // acceptance is run separately against our registered job.
  if (await portOccupied()) return t.skip('Existing listener retained');
  const root = await fixture(t);
  const { url } = await listen(t, (request, response) => response.end('unrelated service'), 4173);
  await assert.rejects(manageService('start', root), /4173端口已有其他服务/);
  assert.equal(await (await fetch(url)).text(), 'unrelated service');
  const stopped = await manageService('stop', root);
  assert.equal(stopped.stopped, false);
  assert.equal(await (await fetch(url)).text(), 'unrelated service');
});
