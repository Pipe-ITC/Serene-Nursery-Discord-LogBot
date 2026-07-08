export async function readRawBody(req) {
  if (typeof req.rawBody === 'string' || Buffer.isBuffer(req.rawBody)) {
    return Buffer.from(req.rawBody);
  }

  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    return Buffer.from(req.body);
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}
