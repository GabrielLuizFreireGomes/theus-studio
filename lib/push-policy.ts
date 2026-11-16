const dayInMs = 24 * 60 * 60 * 1000;

export function reminderAt(startsAt: string | Date, now = new Date()) {
  const due = new Date(+new Date(startsAt) - dayInMs);
  return due >= now ? due : null;
}

export function approvedPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && !url.hash && (
      url.hostname === 'fcm.googleapis.com' || url.hostname === 'updates.push.services.mozilla.com' ||
      url.hostname === 'push.services.mozilla.com' || url.hostname.endsWith('.push.apple.com') ||
      url.hostname.endsWith('.notify.windows.com')
    );
  } catch {
    return false;
  }
}
