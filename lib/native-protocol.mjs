export function encodeMessage(message) {
  const body = Buffer.from(JSON.stringify(message), 'utf8');
  const header = Buffer.alloc(4);
  header.writeUInt32LE(body.length);
  return Buffer.concat([header, body]);
}
export function createDecoder(onMessage) {
  let buffer = Buffer.alloc(0);
  return chunk => {
    buffer = Buffer.concat([buffer, chunk]);
    while (buffer.length >= 4) {
      const size = buffer.readUInt32LE();
      if (size > 1_048_576) throw new Error('ネイティブメッセージが大きすぎます。');
      if (buffer.length < size + 4) return;
      const message = JSON.parse(buffer.subarray(4, size + 4).toString('utf8'));
      buffer = buffer.subarray(size + 4);
      onMessage(message);
    }
  };
}
