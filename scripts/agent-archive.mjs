import { createReadStream } from 'node:fs';
import { createGunzip } from 'node:zlib';
import { AgentError, safeRelative } from './agent-policy.mjs';

function field(block, start, length) {
  return block.subarray(start, start + length).toString('utf8').replace(/\0.*$/s, '');
}
function number(block, start, length) {
  const raw = field(block, start, length).trim();
  if (!/^[0-7]+$/.test(raw)) throw new AgentError('archive_format', 'Only bounded POSIX tar numeric fields are supported.');
  const value = Number.parseInt(raw, 8);
  if (!Number.isSafeInteger(value)) throw new AgentError('archive_format', 'Archive numeric value exceeds policy.');
  return value;
}
function paxFields(buffer) {
  const output = {};
  let position = 0;
  while (position < buffer.length) {
    const space = buffer.indexOf(32, position);
    if (space < 0 || space - position > 10) throw new AgentError('archive_format', 'Malformed archive metadata.');
    const lengthText = buffer.subarray(position, space).toString();
    if (!/^\d+$/.test(lengthText)) throw new AgentError('archive_format', 'Malformed archive metadata length.');
    const length = Number(lengthText), end = position + length;
    if (length <= space - position + 2 || end > buffer.length || buffer[end - 1] !== 10) throw new AgentError('archive_format', 'Malformed archive metadata record.');
    const record = buffer.subarray(space + 1, end - 1).toString('utf8'), equals = record.indexOf('=');
    if (equals < 1) throw new AgentError('archive_format', 'Malformed archive metadata value.');
    const key = record.slice(0, equals);
    if (!['path', 'mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname', 'comment'].includes(key)) throw new AgentError('archive_link', 'Links and sparse archive entries are not supported.');
    output[key] = record.slice(equals + 1); position = end;
  }
  return output;
}

/** Validate compressed input before Docker extracts it onto a host scratch mount. Never extracts on the host. */
export async function validateArchive(archive, policy) {
  let buffered = Buffer.alloc(0), total = 0, entries = 0, remaining = 0, dataSize = 0, metadata = null, metadataChunks = [], metadataSize = 0;
  let pending = {}, prefix = null, zeroBlocks = 0;
  const names = new Set();
  const input = createReadStream(archive), stream = createGunzip();
  input.on('error', error => stream.destroy(error)); input.pipe(stream);
  try {
    for await (const chunk of stream) {
      total += chunk.length;
      if (total > policy.maxCheckoutBytes) throw new AgentError('archive_expansion_limit', 'Expanded archive exceeds the checkout byte limit.');
      buffered = buffered.length ? Buffer.concat([buffered, chunk]) : chunk;
      while (buffered.length) {
        if (remaining > 0) {
          const take = Math.min(remaining, buffered.length), content = Math.min(dataSize, take);
          if (metadata && content) { metadataChunks.push(buffered.subarray(0, content)); metadataSize += content; }
          dataSize -= content; remaining -= take; buffered = buffered.subarray(take);
          if (remaining === 0 && metadata) {
            const values = paxFields(Buffer.concat(metadataChunks, metadataSize));
            if (metadata === 'x') pending = values;
            else if (values.path) throw new AgentError('archive_path', 'Global path overrides are not supported.');
            metadata = null; metadataChunks = []; metadataSize = 0;
          }
          continue;
        }
        if (buffered.length < 512) break;
        const header = buffered.subarray(0, 512); buffered = buffered.subarray(512);
        if (header.every(value => value === 0)) { zeroBlocks++; continue; }
        if (zeroBlocks) throw new AgentError('archive_format', 'Archive contains data after its end marker.');
        let checksum = 0; for (let index = 0; index < 512; index++) checksum += index >= 148 && index < 156 ? 32 : header[index];
        if (checksum !== number(header, 148, 8)) throw new AgentError('archive_format', 'Archive checksum is invalid.');
        const size = number(header, 124, 12), type = String.fromCharCode(header[156] || 48);
        if (++entries > policy.maxCheckoutEntries || size > policy.maxCheckoutBytes) throw new AgentError('archive_entry_limit', 'Archive entry limit exceeded.');
        if (type === 'x' || type === 'g') {
          if (size > 16384 || !size) throw new AgentError('archive_format', 'Archive metadata exceeds limit.');
          metadata = type;
        } else {
          if (!['0', '5'].includes(type) || field(header, 157, 100)) throw new AgentError('archive_link', 'Only regular files and directories are accepted; no links/devices.');
          const prefixField = field(header, 345, 155);
          const raw = (pending.path ?? `${prefixField ? `${prefixField}/` : ''}${field(header, 0, 100)}`).replace(/\/$/, ''); pending = {};
          safeRelative(raw);
          const slash = raw.indexOf('/'), root = slash < 0 ? raw : raw.slice(0, slash);
          if (!prefix) prefix = root;
          if (root !== prefix || slash < 0 && type !== '5') throw new AgentError('archive_path', 'Archive must have one source root.');
          if (slash >= 0) {
            const relative = safeRelative(raw.slice(slash + 1));
            if (names.has(relative)) throw new AgentError('archive_path', 'Duplicate archive paths are not accepted.');
            names.add(relative);
          }
          if (type === '5' && size !== 0) throw new AgentError('archive_format', 'Directory content is not supported.');
        }
        dataSize = size; remaining = Math.ceil(size / 512) * 512;
      }
    }
    if (remaining || buffered.length || zeroBlocks < 2 || !prefix || !names.size || Object.keys(pending).length) throw new AgentError('archive_format', 'Archive is incomplete or malformed.');
    return { entries, expandedBytes: total };
  } catch (error) {
    if (error instanceof AgentError) throw error;
    throw new AgentError('archive_format', 'Compressed source archive is malformed.');
  } finally { input.destroy(); stream.destroy(); }
}
