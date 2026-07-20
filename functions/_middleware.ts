export const onRequest = async (context: { next(): Promise<Response> }) => {
  const response = await context.next();
  const headers = new Headers(response.headers);
  headers.set('Referrer-Policy', 'no-referrer');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
};
