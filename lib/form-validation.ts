export const minimumPasswordLength = 8;
export function passwordError(value: string) {
  if (value.length < minimumPasswordLength) return 'Use uma senha com pelo menos 8 caracteres.';
  if (new TextEncoder().encode(value).length > 72) return 'A senha é longa demais. Escolha uma senha mais curta.';
  return '';
}
