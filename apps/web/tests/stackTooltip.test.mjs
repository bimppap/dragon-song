import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const testDirectory = path.dirname(fileURLToPath(import.meta.url));
function load(file) {
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(path.join(testDirectory, '../lib', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(source, { exports });
  return exports;
}
const { formatStackAmounts, mergeSameStackBarItems, summarizeStackAmounts } = load('stackTooltip.ts');

const env = (key, name, perStackDamage, count) => ({
  key, label: `환경 : ${name}`, count,
  amounts: [{ label: '턴마다 피해', value: perStackDamage, perStack: true }],
});

test('스택당 값은 줄에 그대로 보이고, 종합에서만 개수를 곱한다', () => {
  const items = [env('a', '맹독', 1, 4), env('b', '맹독', 2, 1)];
  assert.equal(formatStackAmounts(items[0].amounts), '턴마다 피해 1');
  assert.equal(formatStackAmounts(items[1].amounts), '턴마다 피해 2');
  // 1 × 4 + 2 × 1 = 6
  assert.equal(summarizeStackAmounts(items), '턴마다 피해 6');
});

test('총합으로 담긴 값은 개수를 곱하지 않는다', () => {
  const items = [{ key: 'x', label: 'A의 격려', count: 1, amounts: [{ label: '피해 증폭', value: 0.2, percent: true, signed: true }] }];
  assert.equal(summarizeStackAmounts(items), '피해 증폭 +20%');
});

test('같은 이름·수치의 줄을 합칠 때 스택당 값은 그대로, 개수만 늘어난다', () => {
  const merged = mergeSameStackBarItems([
    { key: 'a', label: '에너미a의 맹독', count: 2, amounts: [{ label: '턴마다 피해', value: 4, perStack: true }] },
    { key: 'b', label: '에너미a의 맹독', count: 1, amounts: [{ label: '턴마다 피해', value: 4, perStack: true }] },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].count, 3);
  assert.equal(formatStackAmounts(merged[0].amounts), '턴마다 피해 4');
  // 합친 뒤에도 종합은 4 × 3 = 12
  assert.equal(summarizeStackAmounts(merged), '턴마다 피해 12');
});

test('총합으로 담긴 값은 합칠 때 서로 더한다', () => {
  const merged = mergeSameStackBarItems([
    { key: 'a', label: 'A의 주입', count: 1, amounts: [{ label: '공격력', value: 10, signed: true }] },
    { key: 'b', label: 'A의 주입', count: 1, amounts: [{ label: '공격력', value: 10, signed: true }] },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].count, 2);
  assert.equal(formatStackAmounts(merged[0].amounts), '공격력 +20');
});

test('보여줄 것이 다르면 합치지 않는다', () => {
  const merged = mergeSameStackBarItems([
    { key: 'a', label: '에너미a의 맹독', count: 1, amounts: [{ label: '턴마다 피해', value: 4, perStack: true }] },
    { key: 'b', label: '에너미b의 극독', count: 1, amounts: [{ label: '턴마다 피해', value: 10, perStack: true }] },
  ]);
  assert.equal(merged.length, 2);
  assert.equal(summarizeStackAmounts(merged), '턴마다 피해 14');
});

test('0으로 상쇄되는 수치는 종합에서 빠진다', () => {
  const items = [
    { key: 'a', label: 'A', count: 1, amounts: [{ label: '공격력', value: 10, signed: true }] },
    { key: 'b', label: 'B', count: 1, amounts: [{ label: '공격력', value: -10, signed: true }] },
  ];
  assert.equal(summarizeStackAmounts(items), '');
});
