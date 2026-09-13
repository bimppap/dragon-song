import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const testDirectory = path.dirname(fileURLToPath(import.meta.url));
function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(testDirectory, '../lib', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(source, { exports, require: (id) => dependencies[id], ...globals });
  return exports;
}
const outboxModule = load('battleDraftOutbox.ts');
const { BattleDraftOutbox } = outboxModule;
const patch = (changes = {}) => ({ type: 'draft_patch', version: 'v1', draft_type: 'character', entity_id: 1, patch: { kind: 'heal' }, ...changes });
const snapshot = (version = 'v1') => ({ type: 'battle_update', session: { updated_at: version, status: 'in_progress' }, draft: { character: { 1: { kind: 'attack', target_character_id: 3 } } }, preview: null });
const echo = (pending) => ({ ...pending, editor_client_id: 'local', editor_id: 1 });

test('offline edits merge over reconnect snapshot without losing remote fields', () => {
  const outbox = new BattleDraftOutbox();
  outbox.add(patch());
  const restored = outbox.reconcile(snapshot(), 'local');
  assert.equal(restored.draft.character[1].kind, 'heal');
  assert.equal(restored.draft.character[1].target_character_id, 3);
  assert.equal(outbox.size, 1);
});

test('old echoes cannot overwrite newer local inputs or acknowledge them', () => {
  const outbox = new BattleDraftOutbox();
  const first = outbox.add(patch());
  const second = outbox.add(patch({ patch: { kind: 'defend' } }));
  assert.equal(outbox.reconcile(echo(first), 'local').patch.kind, 'defend');
  assert.equal(outbox.size, 1);
  outbox.reconcile(echo(second), 'local');
  assert.equal(outbox.size, 0);
});

test('new turn and deleted battle discard obsolete pending actions', () => {
  const outbox = new BattleDraftOutbox();
  outbox.add(patch());
  assert.equal(outbox.reconcile(snapshot('v2'), 'local').draft.character[1].kind, 'attack');
  assert.equal(outbox.size, 0);
  outbox.add(patch());
  outbox.reconcile({ type: 'battle_deleted', session_id: 1 }, 'local');
  assert.equal(outbox.size, 0);
});

test('socket waits for snapshot, retransmits interrupted writes and clears them on acknowledgement', () => {
  const effects = [], sockets = [], timers = [], received = [];
  class Socket {
    static OPEN = 1;
    readyState = 1;
    sent = [];
    constructor() { sockets.push(this); }
    send(data) { this.sent.push(JSON.parse(data)); }
    close() { this.readyState = 3; this.onclose?.(); }
    receive(data) { this.onmessage({ data: JSON.stringify(data) }); }
  }
  const react = {
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useRef: (current) => ({ current }), useCallback: (callback) => callback,
    useEffectEvent: (callback) => callback, useEffect: (effect) => effects.push(effect),
  };
  const { useBattleSocket } = load('useBattleSocket.ts', {
    react, '@/lib/token': { getToken: () => 'token' }, './battleDraftOutbox': outboxModule,
  }, { process: { env: {} }, WebSocket: Socket, setTimeout: (fn) => timers.push(fn), clearTimeout: () => {} });
  const hook = useBattleSocket(1, (message) => received.push(message));
  const cleanup = effects[0]();
  const first = sockets[0];
  first.onopen();
  hook.send(patch());
  assert.equal(first.sent.length, 0);
  first.receive(snapshot());
  assert.equal(first.sent.length, 1);
  first.close();
  hook.send(patch({ patch: { kind: 'defend' } }));
  timers.shift()();
  const second = sockets[1];
  second.onopen();
  assert.equal(second.sent.length, 0);
  second.receive(snapshot());
  assert.equal(second.sent[0].patch.kind, 'defend');
  assert.equal(received.at(-1).draft.character[1].kind, 'defend');
  second.receive({ ...echo(second.sent[0]), editor_client_id: hook.clientId });
  second.receive(snapshot());
  assert.equal(second.sent.length, 1);
  cleanup();
});


test('a delayed snapshot cannot discard input made against a newer REST response', () => {
  const outbox = new BattleDraftOutbox();
  outbox.add(patch({ version: 'v2' }));
  outbox.reconcile(snapshot('v1'), 'local');
  assert.equal(outbox.size, 1);
  assert.equal(outbox.reconcile(snapshot('v2'), 'local').draft.character[1].kind, 'heal');
});

async function runnerScenario(status) {
  const effects = [], timers = [], writes = [];
  const previous = { id: 1, status, updated_at: 'v1' };
  const next = { id: 2, status: 'in_progress', updated_at: 'v2' };
  let callCount = 0, stateIndex = 0;
  const react = {
    useState: (initial) => {
      const index = stateIndex++;
      return [index === 3 ? previous : initial, (value) => { if (index === 3) writes.push(value); }];
    },
    useRef: (current) => ({ current }), useEffectEvent: (callback) => callback,
    useEffect: (effect) => effects.push(effect),
  };
  const noop = () => {};
  const dependencies = {
    react, 'react/jsx-runtime': { jsx: noop, jsxs: noop },
    'next/image': { default: noop }, 'lucide-react': {},
    '@/components/common/EmptyState': { default: noop },
    '@/components/common/ToastProvider': { useToast: () => ({ toast: noop }) },
    '@/components/ui/badge': {}, './BattleArena': { default: noop },
    '@/lib/api': { fetchLiveBattle: async () => ++callCount === 1 ? null : next },
    '@/lib/useBattleSocket': { useBattleSocket: () => ({ connected: true }) },
  };
  const { default: Runner } = load('../app/battle/components/RunnerBattleOverview.tsx', dependencies, {
    setTimeout: (callback) => timers.push(callback), clearTimeout: noop,
    document: { visibilityState: 'visible', addEventListener: noop, removeEventListener: noop },
  });
  Runner();
  const cleanup = effects[1]();
  await new Promise(setImmediate);
  if (status === 'in_progress') {
    assert.equal(callCount, 0);
    return;
  }
  assert.equal(callCount, 1);
  assert.equal(writes.length, 0, 'keep finished result when no next battle exists');
  timers.shift()();
  await new Promise(setImmediate);
  assert.equal(writes.at(-1).id, 2, 'discover next battle despite old socket staying connected');
  cleanup();
}

test('finished runner keeps results and discovers the next battle with an open socket', () => runnerScenario('finished'));
test('active runner does not duplicate websocket updates with polling', () => runnerScenario('in_progress'));
