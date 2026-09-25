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
  vm.runInNewContext(source, { exports, require: () => ({}) });
  return exports;
}
const cafeModule = load('cafeBattleActions.ts');
// vm 안에서 만든 배열은 프로토타입이 달라 deepEqual이 실패하므로 일반 객체로 바꿔 비교한다.
const planCafeActions = (...args) => JSON.parse(JSON.stringify(cafeModule.planCafeActions(...args)));
const post = (article_id, writer_name, head_name) => ({ article_id, writer_name, head_name });
const actor = (character_id, name) => ({ character_id, name });

test('maps each header to an action and gives no-post actors no action', () => {
  const posts = [post(1, '루체릴', '방어'), post(2, '노메드', '기술'), post(3, '길', '소비'), post(4, '서틴', '치유')];
  const actors = [actor(1, '루체릴'), actor(2, '노메드'), actor(3, '길'), actor(4, '서틴'), actor(5, '팡')];

  const plan = planCafeActions(posts, actors);

  assert.deepEqual(
    plan.actions.map(({ name, kind, post }) => [name, kind, post?.article_id ?? null]),
    [['루체릴', 'defend', 1], ['노메드', 'skill', 2], ['길', 'item', 3], ['서틴', 'heal', 4], ['팡', 'none', null]],
  );
  assert.deepEqual(plan.unknownHeads, []);
  assert.deepEqual(plan.outsiders, []);
});

test('leaves actors with unreadable headers unchanged and reports them', () => {
  const plan = planCafeActions([post(1, '팡', '잡담'), post(2, '길', null)], [actor(1, '팡'), actor(2, '길')]);

  assert.deepEqual(plan.actions, []);
  assert.deepEqual(plan.unknownHeads.map(({ name, head }) => [name, head]), [['팡', '잡담'], ['길', null]]);
});

test('reports action posts from non-actors but ignores notices', () => {
  const plan = planCafeActions([post(1, '드래곤송', '안내'), post(2, '기절한 캐릭터', '공격'), post(3, '누군가', 'constructor')], [actor(1, '팡')]);

  assert.deepEqual(plan.outsiders, ['기절한 캐릭터']);
});

test('follows the latest post when an actor posts twice', () => {
  const plan = planCafeActions([post(3, '팡', '공격'), post(5, '팡', '방어')], [actor(1, '팡')]);

  assert.equal(plan.actions[0].kind, 'defend');
});

test('reads menuid from a number or a board URL', () => {
  const { parseCafeMenuId } = cafeModule;
  assert.equal(parseCafeMenuId(' 44 '), 44);
  assert.equal(parseCafeMenuId('https://cafe.naver.com/f-e/cafes/31734615/menus/44?viewType=I'), 44);
  assert.equal(parseCafeMenuId('https://cafe.naver.com/ArticleList.nhn?search.clubid=31734615&search.menuid=21'), 21);
  assert.equal(parseCafeMenuId(''), null);
  assert.equal(parseCafeMenuId('0'), null);
  assert.equal(parseCafeMenuId('https://cafe.naver.com/f-e/cafes/31734615'), null);
});
