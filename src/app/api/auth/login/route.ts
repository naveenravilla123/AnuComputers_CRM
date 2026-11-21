import {NextResponse} from "next/server";
import {createHash,timingSafeEqual} from "node:crypto";
import {signature} from "@/lib/session";
export async function POST(req:Request){
const email=process.env.CRM_ADMIN_EMAIL,password=process.env.CRM_ADMIN_PASSWORD;
if(!email||!password||password.length<12||!process.env.CRM_SESSION_SECRET||process.env.CRM_SESSION_SECRET.length<32)return NextResponse.json({error:"Administrator setup required."},{status:503});
try{const body=await req.json();const equal=(a:string,b:string)=>timingSafeEqual(createHash("sha256").update(a).digest(),createHash("sha256").update(b).digest());if(typeof body.email!=="string"||typeof body.password!=="string"||!equal(body.email.trim().toLowerCase(),email.trim().toLowerCase())||!equal(body.password,password))return NextResponse.json({error:"Invalid email or password."},{status:401});
const value=String(Date.now()+8*60*60*1000)+"."+crypto.randomUUID();const response=NextResponse.json({ok:true});response.cookies.set("anu_session",value+"."+await signature(value),{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:"/",maxAge:28800});return response;
}catch{return NextResponse.json({error:"Unable to sign in."},{status:400});}}
