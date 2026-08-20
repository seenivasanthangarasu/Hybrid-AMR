import { describe, it, expect } from 'vitest';
import { McapWriter, McapStreamReader, TempBuffer } from '@mcap/core';

/**
 * REQ-A0 feasibility spike (data-handling-nav2-tasks.md decision 5): confirms
 * @mcap/core can write valid MCAP using `schemaEncoding: 'jsonschema'` /
 * `messageEncoding: 'json'` — i.e. plain JS objects serialized as JSON bytes,
 * with no CDR serializer — and that the result reads back correctly. This is
 * the encoding McapRecordingService/CameraSnapshotService are built on.
 */
describe('MCAP json encoding spike (REQ-A0)', () => {
  it('writes json-encoded messages and reads them back', async () => {
    const buffer = new TempBuffer();
    const writer = new McapWriter({ writable: buffer, useStatistics: true });

    await writer.start({ library: 'amr-dashboard-spike', profile: '' });

    const schemaId = await writer.registerSchema({
      name: 'nav_msgs/Odometry',
      encoding: 'jsonschema',
      data: new TextEncoder().encode(JSON.stringify({ type: 'object' })),
    });

    const channelId = await writer.registerChannel({
      topic: '/odom',
      schemaId,
      messageEncoding: 'json',
      metadata: new Map(),
    });

    const payload = { pose: { position: { x: 1, y: 2, z: 0 } } };
    await writer.addMessage({
      channelId,
      sequence: 0,
      logTime: 1000n,
      publishTime: 1000n,
      data: new TextEncoder().encode(JSON.stringify(payload)),
    });

    await writer.end();

    const reader = new McapStreamReader();
    reader.append(buffer.get());

    const messages = [];
    let record;
    while ((record = reader.nextRecord())) {
      if (record.type === 'Message') messages.push(record);
    }

    expect(reader.done()).toBe(true);
    expect(messages).toHaveLength(1);
    expect(JSON.parse(new TextDecoder().decode(messages[0].data))).toEqual(payload);
  });
});
