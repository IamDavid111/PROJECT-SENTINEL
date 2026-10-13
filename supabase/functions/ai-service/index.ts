import { handleAiRequest } from './handler.ts'

// Keep startup separate so tests can call the real handler without opening a server.
Deno.serve((request) => handleAiRequest(request))
