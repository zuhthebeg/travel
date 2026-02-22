interface Env {
  R2_BUCKET?: R2Bucket;
  IMAGES?: R2Bucket;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { key } = context.params as { key: string };
  const bucket = context.env.R2_BUCKET || context.env.IMAGES;
  if (!bucket) return new Response('R2 binding missing', { status: 500 });
  const object = await bucket.get(key);

  if (object === null) {
    return new Response('Object Not Found', { status: 404 });
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);

  return new Response(object.body, {
    headers,
  });
};
