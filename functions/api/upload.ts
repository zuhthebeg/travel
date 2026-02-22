interface Env {
  R2_BUCKET?: R2Bucket;
  IMAGES?: R2Bucket;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const file = await context.request.formData().then(data => data.get('file')) as File;

  if (!file) {
    return new Response(JSON.stringify({ error: 'File is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const bucket = context.env.R2_BUCKET || context.env.IMAGES;
  if (!bucket) {
    return new Response(JSON.stringify({ error: 'Upload storage is not configured (R2 binding missing)' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const key = `${Date.now()}-${file.name}`;
  await bucket.put(key, await file.arrayBuffer(), {
    httpMetadata: {
      contentType: file.type,
    },
  });

  const url = `/api/images/${key}`;

  return new Response(JSON.stringify({ url }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
