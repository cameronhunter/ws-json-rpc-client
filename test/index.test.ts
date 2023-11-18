import { test } from 'node:test';
import { hello } from '../src/index';
import { equal } from 'node:assert';

test('hello world', () => {
    equal(hello('world'), 'Hello world!');
});
