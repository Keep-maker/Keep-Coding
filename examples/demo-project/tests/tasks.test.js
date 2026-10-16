import { TaskStore } from '../src/index.js';
import assert from 'node:assert';

const store = new TaskStore();
const first = store.add('Write the README', 'high');
const second = store.add('Ship the release');

assert.equal(store.tasks.length, 2, 'should track two tasks');
assert.equal(first.priority, 'high', 'should keep priority');
assert.equal(store.pending().length, 2, 'both tasks are pending');

store.complete(first.id);
assert.equal(store.pending().length, 1, 'one task remains');
assert.ok(store.complete(first.id), 'completing twice is idempotent');
assert.equal(store.complete('missing'), null, 'unknown ids return null');

console.log('all task tests passed');


