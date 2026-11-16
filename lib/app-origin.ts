export function appOrigin(request: Request) {
  return new URL(process.env.APP_ORIGIN || request.url).origin;
}

export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  return !origin || origin === appOrigin(request);
}
