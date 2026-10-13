import { handleExtractionRequest } from './handler.ts'

Deno.serve((request) => handleExtractionRequest(request))
