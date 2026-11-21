import {NextRequest,NextResponse} from "next/server";
import {validSession} from "@/lib/session";
export async function middleware(request:NextRequest){
const path=request.nextUrl.pathname,api=path.startsWith("/api/"),mutation=!["GET","HEAD","OPTIONS"].includes(request.method);
if(api&&mutation&&path!=="/api/communications/webhook"){const origin=request.headers.get("origin"),site=request.headers.get("sec-fetch-site");if((origin&&origin!==request.nextUrl.origin)||site==="cross-site"||site==="same-site")return NextResponse.json({error:"Cross-origin request denied"},{status:403});}
if((path==="/"||path.startsWith("/invoice/"))&&!await validSession(request.cookies.get("anu_session")?.value))return NextResponse.redirect(new URL("/login",request.url));
const response=NextResponse.next();response.headers.set("Cache-Control","private, no-store");response.headers.set("X-Content-Type-Options","nosniff");response.headers.set("X-Frame-Options","DENY");response.headers.set("Referrer-Policy","no-referrer");response.headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=()");response.headers.set("Content-Security-Policy","frame-ancestors 'none'; object-src 'none'; base-uri 'self'");return response;
}
export const config={matcher:["/((?!_next/static|_next/image|favicon.ico).*)"]};
