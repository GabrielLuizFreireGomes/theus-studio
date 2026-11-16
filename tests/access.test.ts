import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hasPasswordSession, isStudioAdmin } from '../lib/auth-policy';
import { approvedPushEndpoint, reminderAt } from '../lib/push-policy';

test('studio sessions require a password and admin is assigned by user ID', () => {
  assert.equal(hasPasswordSession([{ method: 'otp' }]), false);
  assert.equal(hasPasswordSession([{ method: 'password' }]), true);
  assert.equal(isStudioAdmin('existing-uuid', 'other-uuid, existing-uuid'), true);
  assert.equal(isStudioAdmin('barbeiro@example.com', 'existing-uuid'), false);
});

test('reminders are set only when there is at least one day of lead time', () => {
  const now = new Date('2026-11-16T12:00:00Z');
  assert.equal(reminderAt(new Date('2026-11-17T11:59:59Z'), now), null);
  assert.equal(reminderAt(new Date('2026-11-17T12:00:00Z'), now)?.toISOString(), now.toISOString());
});

test('push subscriptions accept HTTPS endpoints from supported providers', () => {
  assert.equal(approvedPushEndpoint('https://fcm.googleapis.com/fcm/send/example'), true);
  assert.equal(approvedPushEndpoint('https://web.push.apple.com/example'), true);
  assert.equal(approvedPushEndpoint('https://fcm.googleapis.com.example.invalid/'), false);
  assert.equal(approvedPushEndpoint('https://web.push.apple.com:444/example'), false);
  assert.equal(approvedPushEndpoint('http://127.0.0.1/'), false);
});
