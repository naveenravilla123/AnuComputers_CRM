import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {getStaffSession} from "@/lib/staff-session";
export const dynamic="force-dynamic";
export async function GET(r:NextRequest){try{const user=await getStaffSession(r.cookies.get("anu_staff_session")?.value);if(!user)return NextResponse.json({error:"Unauthorized"},{status:401});if(user.role!=="TECHNICIAN"||!user.permissions.includes("JobCard:READ"))return NextResponse.json({error:"Job card access denied"},{status:403});const jobs=await prisma.jobCard.findMany({where:{technicianId:user.id},select:{id:true,status:true,diagnosis:true,notes:true,case:{select:{issue:true,priority:true,asset:{select:{brand:true,model:true,serialNumber:true}}}}}});return NextResponse.json({jobs},{headers:{"Cache-Control":"no-store"}})}catch{return NextResponse.json({error:"Unavailable"},{status:503})}}
