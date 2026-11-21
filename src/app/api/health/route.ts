import {NextResponse} from "next/server";export async function GET(){return NextResponse.json({status:"ok",app:"Anu Computers CRM",time:new Date().toISOString()})}
