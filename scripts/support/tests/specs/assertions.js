export function createBrowserAsserts() {
  return {
    ok(condition, message = "expected value to be truthy") {
      if (!condition) throw new Error(message);
    },
    strictEqual(actual, expected, message = "values are not equal") {
      if (!Object.is(actual, expected)) {
        throw new Error(
          `${message}: expected ${String(expected)}, received ${String(actual)}`,
        );
      }
    },
    deepStrictEqual(actual, expected, message = "values are not deeply equal") {
      const actualStr = JSON.stringify(actual);
      const expectedStr = JSON.stringify(expected);
      if (actualStr !== expectedStr) {
        throw new Error(
          `${message}: expected ${expectedStr}, received ${actualStr}`,
        );
      }
    },
  };
}

export function createNodeAsserts(assert) {
  return {
    ok: (condition, message) => assert.ok(condition, message),
    strictEqual: (actual, expected, message) =>
      assert.strictEqual(actual, expected, message),
    deepStrictEqual: (actual, expected, message) =>
      assert.deepStrictEqual(actual, expected, message),
  };
}
