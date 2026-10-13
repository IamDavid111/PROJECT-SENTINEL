import { handleKnowledgeRequest } from './handler.ts'

Deno.serve((request) => handleKnowledgeRequest(request))
