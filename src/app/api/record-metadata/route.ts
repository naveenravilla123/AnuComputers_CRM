import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {validSession} from "@/lib/session";
import {standardCatalog} from "@/lib/setup-metadata";
import {effectiveLayout} from "@/lib/effective-layout";
export const dynamic="force-dynamic";
export async function GET(r:NextRequest){if(!await validSession(r.cookies.get("anu_session")?.value))return NextResponse.json({error:"Unauthorized"},{status:401});const entity=r.nextUrl.searchParams.get("entity")||"";if(!Object.prototype.hasOwnProperty.call(standardCatalog,entity))return NextResponse.json({error:"Unknown object"},{status:400});try{const [fields,rules]=await Promise.all([prisma.customField.findMany({where:{entity}}),prisma.businessSetting.findUnique({where:{key:"setup.validation."+entity}})]);const sections=await effectiveLayout(prisma,entity,fields.map(field=>field.key));return NextResponse.json({fields,sections,rules:rules?.value||[]},{headers:{"Cache-Control":"no-store"}})}catch{return NextResponse.json({error:"Metadata unavailable"},{status:503})}}
