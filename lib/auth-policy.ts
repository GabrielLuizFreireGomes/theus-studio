export function hasPasswordSession(methods?: (string | { method: string })[]) {
  return methods?.some((entry) => (typeof entry === 'string' ? entry : entry.method) === 'password') ?? false;
}

export function isStudioAdmin(userId: string, ids = process.env.ADMIN_USER_IDS ?? '') {
  return ids.split(',').some((id) => id.trim() === userId);
}
