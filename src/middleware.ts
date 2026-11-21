import {NextRequest,NextResponse} from "next/server";
export function middleware(request:NextRequest){
 const secret=process.env.CRM_API_KEY;
 if(!secret)return new NextResponse("CRM access is not configured",{status:503});
 const expected="Basic "+btoa("admin:"+secret);
 const actual=request.headers.get("authorization")||"";
 let diff=actual.length^expected.length;
 for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^(actual.charCodeAt(i)||0);
 if(diff!==0)return new NextResponse("Authentication required",{status:401,headers:{"WWW-Authenticate":'Basic realm="Anu Computers CRM", charset="UTF-8"',"Cache-Control":"no-store"}});
 const response=NextResponse.next();response.headers.set("Cache-Control","private, no-store");return response;
}
export const config={matcher:["/"]};
