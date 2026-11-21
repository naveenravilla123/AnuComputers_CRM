import {NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {authorized} from "@/lib/api-auth";
export const dynamic="force-dynamic";
export async function GET(request:Request){
 if(!authorized(request))return NextResponse.json({error:"Unauthorized"},{status:401});
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
