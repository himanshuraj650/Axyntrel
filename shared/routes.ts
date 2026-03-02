import { z } from 'zod';
import { insertRoomSchema, rooms } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  rooms: {
    create: {
      method: 'POST' as const,
      path: '/api/rooms' as const,
      input: z.object({ id: z.string().optional() }).optional(),
      responses: {
        201: z.custom<typeof rooms.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/rooms/:id' as const,
      responses: {
        200: z.custom<typeof rooms.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}

// WebSocket Event Contracts for Signaling and E2EE Messaging
export const wsEvents = {
  send: {
    join: z.object({ roomId: z.string() }),
    publicKey: z.object({ roomId: z.string(), publicKey: z.string() }),
    message: z.object({ roomId: z.string(), encryptedPayload: z.string(), iv: z.string() }),
    typing: z.object({ roomId: z.string(), isTyping: z.boolean() }),
    callSignal: z.object({ roomId: z.string(), encryptedPayload: z.string(), iv: z.string() }),
    leave: z.object({ roomId: z.string() })
  },
  receive: {
    userJoined: z.object({ clientsCount: z.number() }),
    publicKey: z.object({ publicKey: z.string() }),
    message: z.object({ encryptedPayload: z.string(), iv: z.string(), timestamp: z.number() }),
    typing: z.object({ isTyping: z.boolean() }),
    callSignal: z.object({ encryptedPayload: z.string(), iv: z.string(), timestamp: z.number() }),
    userLeft: z.object({ clientsCount: z.number() }),
    error: z.object({ message: z.string() })
  }
};
