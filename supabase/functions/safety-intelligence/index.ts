import { handleSafetyRequest } from './handler.ts'

Deno.serve((request) => handleSafetyRequest(request))
