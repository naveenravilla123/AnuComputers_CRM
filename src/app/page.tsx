import Workspace from "@/components/workspace";
import {prisma} from "@/lib/prisma";
import {headers} from "next/headers";
import {authorized} from "@/lib/api-auth";
export const dynamic="force-dynamic";
export default async function Home(){
 if(!authorized(new Request("http://localhost",{headers:headers()})))return <Workspace metrics={null}/>;
 try{const [sales,service,activeRepairs,unpaid]=await Promise.all([
 prisma.invoice.aggregate({where:{orderId:{not:null},status:"PAID"},_sum:{total:true}}),
 prisma.invoice.aggregate({where:{caseId:{not:null},orderId:null,status:"PAID"},_sum:{total:true}}),
 prisma.serviceCase.count({where:{status:{notIn:["DELIVERED","CLOSED","CANCELLED","COMPLETED"]}}}),
 prisma.invoice.aggregate({where:{status:"UNPAID"},_sum:{total:true}})
 ]);const salesRevenue=Number(sales._sum.total||0),serviceRevenue=Number(service._sum.total||0);
 return <Workspace metrics={{salesRevenue,serviceRevenue,totalRevenue:salesRevenue+serviceRevenue,activeRepairs,unpaid:Number(unpaid._sum.total||0)}}/>;
 }catch{return <Workspace metrics={null}/>;}
}
