import { createHash, timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { pushConfig, sendDueNotifications } from '@/lib/push';

const digest = (value: string) => createHash('sha256').update(value).digest();

export async function POST(request: Request) {
  const config = pushConfig();
  const authorization = request.headers.get('authorization');
  if (!config || !authorization || !timingSafeEqual(digest(authorization), digest('Bearer ' + config.secret))) {
    return new NextResponse(null, { status: 401 });
  }
  const result = await sendDueNotifications(config);
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
