import {NextRequest,NextResponse} from "next/server";
import {validSession} from "@/lib/session";
export async function middleware(request:NextRequest){
if(!await validSession(request.cookies.get("anu_session")?.value))return NextResponse.redirect(new URL("/login",request.url));
const response=NextResponse.next();response.headers.set("Cache-Control","private, no-store");return response;
}
export const config={matcher:["/"]};
