import { describe, expect, it } from 'vitest';
import { createBranchSchema } from './create-branch.schema.js';

describe('createBranchSchema', () => {
  it('aceita nome preenchido', () => {
    expect(createBranchSchema.safeParse({ name: 'Filial Norte' }).success).toBe(
      true,
    );
  });

  it('recusa nome vazio ou só espaço', () => {
    expect(createBranchSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createBranchSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});
