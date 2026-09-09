import { test } from 'node:test';
import assert from 'node:assert/strict';
import { credentialsSchema, registrationSchema } from '@tts-workbench/account-core';

test('Creation and login share the 8–128 password boundary', () => {
  for (const schema of [credentialsSchema, registrationSchema]) {
    for (const length of [7, 8, 12, 128, 129]) {
      const data = { login: 'password-check', password: 'p'.repeat(length) };
      if (schema === registrationSchema) data.displayName = 'Password check';
      assert.equal(schema.safeParse(data).success, length >= 8 && length <= 128, `length=${length}`);
    }
  }
});
