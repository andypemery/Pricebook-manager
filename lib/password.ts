export type PasswordPolicy = { minLength: number; requireUppercase: boolean; requireLowercase: boolean; requireNumber: boolean; requireLetter: boolean; requireSpecial: boolean };
export const axiomMinimumPasswordPolicy: PasswordPolicy = { minLength: 8, requireUppercase: true, requireLowercase: true, requireNumber: true, requireLetter: true, requireSpecial: false };
export function validatePassword(password: string, policy: PasswordPolicy = axiomMinimumPasswordPolicy): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (password.length < policy.minLength) errors.push(`at least ${policy.minLength} characters`);
  if (policy.requireUppercase && !/[A-Z]/.test(password)) errors.push("one uppercase letter");
  if (policy.requireLowercase && !/[a-z]/.test(password)) errors.push("one lowercase letter");
  if (policy.requireNumber && !/[0-9]/.test(password)) errors.push("one number");
  if (policy.requireLetter && !/[A-Za-z]/.test(password)) errors.push("one letter");
  if (policy.requireSpecial && !/[^A-Za-z0-9]/.test(password)) errors.push("one special character");
  return { ok: errors.length === 0, errors };
}
