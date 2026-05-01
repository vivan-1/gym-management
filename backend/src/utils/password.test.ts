import { describe, it, expect } from 'vitest';
import { hashPassword, comparePassword, validatePasswordStrength } from './password';

describe('hashPassword', () => {
  it('should return a bcrypt hash string', async () => {
    const hash = await hashPassword('TestPass1!');
    expect(hash).toBeDefined();
    expect(hash).not.toBe('TestPass1!');
    // bcrypt hashes start with $2b$ or $2a$
    expect(hash).toMatch(/^\$2[ab]\$/);
  });

  it('should produce different hashes for the same password (due to salt)', async () => {
    const hash1 = await hashPassword('TestPass1!');
    const hash2 = await hashPassword('TestPass1!');
    expect(hash1).not.toBe(hash2);
  });

  it('should respect configurable salt rounds', async () => {
    const hash = await hashPassword('TestPass1!', 4);
    expect(hash).toMatch(/^\$2[ab]\$04\$/);
  });
});

describe('comparePassword', () => {
  it('should return true for a matching password', async () => {
    const password = 'SecureP@ss1';
    const hash = await hashPassword(password);
    const result = await comparePassword(password, hash);
    expect(result).toBe(true);
  });

  it('should return false for a non-matching password', async () => {
    const hash = await hashPassword('SecureP@ss1');
    const result = await comparePassword('WrongPassword1!', hash);
    expect(result).toBe(false);
  });
});

describe('validatePasswordStrength', () => {
  it('should accept a valid password', () => {
    const result = validatePasswordStrength('Abcdef1!');
    expect(result.success).toBe(true);
    expect(result.errors).toBeUndefined();
  });

  it('should reject a password shorter than 8 characters', () => {
    const result = validatePasswordStrength('Ab1!xyz');
    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.some((e) => e.includes('8 characters'))).toBe(true);
  });

  it('should reject a password without an uppercase letter', () => {
    const result = validatePasswordStrength('abcdef1!');
    expect(result.success).toBe(false);
    expect(result.errors!.some((e) => e.includes('uppercase'))).toBe(true);
  });

  it('should reject a password without a lowercase letter', () => {
    const result = validatePasswordStrength('ABCDEF1!');
    expect(result.success).toBe(false);
    expect(result.errors!.some((e) => e.includes('lowercase'))).toBe(true);
  });

  it('should reject a password without a digit', () => {
    const result = validatePasswordStrength('Abcdefg!');
    expect(result.success).toBe(false);
    expect(result.errors!.some((e) => e.includes('digit'))).toBe(true);
  });

  it('should reject a password without a special character', () => {
    const result = validatePasswordStrength('Abcdefg1');
    expect(result.success).toBe(false);
    expect(result.errors!.some((e) => e.includes('special character'))).toBe(true);
  });

  it('should return multiple errors for multiple violations', () => {
    const result = validatePasswordStrength('abc');
    expect(result.success).toBe(false);
    expect(result.errors!.length).toBeGreaterThan(1);
  });
});
