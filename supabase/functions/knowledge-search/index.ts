import { handleSearchRequest } from './handler.ts'

Deno.serve((request) => handleSearchRequest(request))
