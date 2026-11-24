import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {authorizeAll} from "@/lib/request-access";
import {canReadStaffFields} from "@/lib/staff-field-access";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 const auth=await authorizeAll(request,[{object:"Invoice",action:"READ"},{object:"Customer",action:"READ"},{object:"Product",action:"READ"},{object:"ServiceCase",action:"READ"}]);
 if(!auth.allowed)return NextResponse.json({error:auth.status===401?"Unauthorized":"Forbidden"},{status:auth.status});
 if(auth.access.kind==="staff"&&!canReadStaffFields(auth.access.user,[["Invoice","total"],["Invoice","status"],["Invoice","orderId"],["Invoice","caseId"],["ServiceCase","status"]]))return NextResponse.json({error:"Forbidden"},{status:403});
 try{
 const [customers,products,services,sales,service,activeRepairs]=await Promise.all([
 prisma.customer.count(),prisma.product.count(),prisma.serviceCase.count(),
 prisma.invoice.aggregate({where:{orderId:{not:null},status:"PAID"},_sum:{total:true}}),
 prisma.invoice.aggregate({where:{caseId:{not:null},orderId:null,status:"PAID"},_sum:{total:true}}),
 prisma.serviceCase.count({where:{status:{notIn:["DELIVERED","CLOSED","CANCELLED","COMPLETED"]}}})
 ]);
 const salesRevenue=Number(sales._sum.total||0),serviceRevenue=Number(service._sum.total||0);
 return NextResponse.json({customers,products,services,salesRevenue,serviceRevenue,totalRevenue:salesRevenue+serviceRevenue,activeRepairs},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Database unavailable or schema not initialized"},{status:503});}
}
