import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('package metadata', () => {
  it('reads the CLI package name from package.json', () => {
    const packageJson = JSON.parse(
      readFileSync(resolve(process.cwd(), 'package.json'), 'utf8'),
    ) as { name: string };

    expect(packageJson.name).toBe('agents-repo');
  });
});
