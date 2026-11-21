import {NextResponse} from "next/server";
export async function POST(){const response=NextResponse.json({ok:true});response.cookies.set("anu_session","",{path:"/",maxAge:0,httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict"});return response;}
