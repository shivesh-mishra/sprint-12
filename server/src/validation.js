import { config } from './config.js';

const CONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200E\u200F\u202A-\u202E\u2066-\u2069]/g;

export function validateUsername(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Username is required.' };
  const name = raw.trim();
  if (!config.usernameRegex.test(name)) {
    return {
      ok: false,
      error: 'Username must be 2-20 characters: letters, numbers, "_" or "-".',
    };
  }
  return { ok: true, value: name };
}

export function validateRoom(raw) {
  if (typeof raw !== 'string') return { ok: false, error: 'Invalid room.' };
  const room = config.rooms.find((r) => r === raw);
  return room ? { ok: true, value: room } : { ok: false, error: 'Unknown room.' };
}

export function validateMessage(payload) {
  if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
    return { ok: false, error: 'Invalid payload.' };
  }
  if (typeof payload.text !== 'string') return { ok: false, error: 'Message must be text.' };
  const text = payload.text.replace(CONTROL, '').trim();
  if (text.length === 0) return { ok: false, error: 'Message is empty.' };
  if (text.length > config.maxMessageLength) {
    return { ok: false, error: `Message exceeds ${config.maxMessageLength} characters.` };
  }
  return { ok: true, value: text };
}

export function validateTyping(payload) {
  if (payload === null || typeof payload !== 'object' || typeof payload.isTyping !== 'boolean') {
    return { ok: false, error: 'Invalid payload.' };
  }
  return { ok: true, value: payload.isTyping };
}
