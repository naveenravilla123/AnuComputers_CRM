export function authorized(request:Request){const secret=process.env.CRM_API_KEY;return Boolean(secret&&request.headers.get("authorization")==="Bearer "+secret)}
