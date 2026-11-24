import {auditedSalesWrite} from "@/lib/sales-audit";
import {NextRequest,NextResponse} from "next/server";
import {Prisma} from "@prisma/client";
import {prisma} from "@/lib/prisma";
import {authorizeAll,authorizeRequest} from "@/lib/request-access";
import {assertStaffFieldEdits,canReadStaffFields,filterStaffRecord,filterStaffResponse} from "@/lib/staff-field-access";
import {saveNewCustomValues} from "@/lib/new-custom-values";
import {validateRecord} from "@/lib/record-validation";
export const dynamic="force-dynamic";
const fail=(error:string,status=400)=>NextResponse.json({error},{status});
function itemQuantities(items: { productId: string; qty: number }[]) {
  const quantities = new Map<string, number>();
  for (const { productId, qty } of items) {
    quantities.set(productId, (quantities.get(productId) ?? 0) + qty);
  }
  return quantities;
}

export async function GET(r:NextRequest){const auth=await authorizeRequest(r,"SalesOrder","READ");if(!auth.allowed)return fail(auth.status===401?"Unauthorized":"Forbidden",auth.status);try{const [customers,products,branches,orders,reservations]=await Promise.all([prisma.customer.findMany(),prisma.product.findMany({where:{active:true},include:{stocks:true}}),prisma.branch.findMany(),prisma.salesOrder.findMany({include:{customer:true,items:{include:{product:true}},invoices:true},orderBy:{createdAt:"desc"}}),prisma.businessSetting.findMany({where:{key:{startsWith:"order.branch."}}})]);const reservationAvailability: Record<string, Record<string, boolean>> = {};
const staff = auth.access.kind === "staff" ? auth.access.user : null;
if (!staff || canReadStaffFields(staff, [
  ["SalesOrder", "status"], ["Branch", "name"], ["Stock", "branchId"],
  ["Stock", "qty"], ["Stock", "reserved"],
])) {
  const drafts = orders.filter(order => order.status === "DRAFT");
  if (drafts.length && branches.length) {
    const productIds = [...new Set(drafts.flatMap(order => order.items.map(item => item.productId)))];
    const stocks = await prisma.stock.findMany({
      where: { productId: { in: productIds } },
      select: { productId: true, branchId: true, qty: true, reserved: true },
    });
    const available = new Map(stocks.map(stock => [JSON.stringify([stock.branchId, stock.productId]), stock.qty - stock.reserved]));
    for (const order of drafts) {
      const quantities = [...itemQuantities(order.items)];
      reservationAvailability[order.id] = Object.fromEntries(branches.map(branch => [
        branch.id, quantities.every(([productId, qty]) =>
          (available.get(JSON.stringify([branch.id, productId])) ?? 0) >= qty),
      ]));
    }
  }
}
const result={customers,products,branches,orders,reservationAvailability,branchByOrder:auth.access.kind==="admin" || auth.access.user.permissions.includes("Branch:READ")
 ? Object.fromEntries(reservations.map(s=>[s.key.slice(13),s.value])) : {}};return NextResponse.json(auth.access.kind==="staff"?filterStaffResponse(auth.access.user,result,{customers:"Customer",products:"Product",branches:"Branch",orders:"SalesOrder"}):result,{headers:{"Cache-Control":"no-store"}})}catch{return fail("Database unavailable",503)}}
export async function POST(r:NextRequest){try{const x=await r.json();const requirements=x.action==="create"?[{object:"SalesOrder" as const,action:"CREATE" as const},{object:"Customer" as const,action:"READ" as const},{object:"Product" as const,action:"READ" as const}]:[{object:"SalesOrder" as const,action:"EDIT" as const},{object:"Stock" as const,action:"EDIT" as const},...(x.action==="confirm"?[{object:"Branch" as const,action:"READ" as const}]:[])];const auth=await authorizeAll(r,requirements);if(!auth.allowed)return fail(auth.status===401?"Unauthorized":"Forbidden",auth.status);const staff=auth.access.kind==="staff"?auth.access.user:undefined;if(staff){if(x.action==="create")assertStaffFieldEdits(staff,"SalesOrder",["customerId"]);else{assertStaffFieldEdits(staff,"SalesOrder",["status"]);assertStaffFieldEdits(staff,"Stock",x.action==="deliver"?["qty","reserved"]:["reserved"]);}}if(x.action==="create"){if(!x.customerId||!Array.isArray(x.items)||!x.items.length||x.items.length>100)return fail("Customer and 1–100 items required");const items=x.items.map((i:any)=>{if(!i.productId||!Number.isSafeInteger(i.qty)||i.qty<1||i.qty>1000000||!/^\d{1,10}(\.\d{1,2})?$/.test(String(i.unitPrice)))throw new Error("Invalid item");return {productId:String(i.productId),qty:i.qty,unitPrice:new Prisma.Decimal(String(i.unitPrice))}});const total=items.reduce((n:Prisma.Decimal,i:{qty:number;unitPrice:Prisma.Decimal})=>n.add(i.unitPrice.mul(i.qty)),new Prisma.Decimal(0));const created=await auditedSalesWrite(auth.access,async tx=>{const order=await tx.salesOrder.create({data:{number:"SO-"+crypto.randomUUID(),customerId:String(x.customerId),total,items:{create:items}}});await saveNewCustomValues(tx,"SalesOrder",order.id,x.customValues,staff);return validateRecord(tx,"SalesOrder",order)},{isolationLevel:"Serializable"});return NextResponse.json(staff?filterStaffRecord(staff,"SalesOrder",created):created,{status:201})}
const result=await auditedSalesWrite(auth.access,async tx=>{const id=String(x.id||"");const order=await tx.salesOrder.findUniqueOrThrow({where:{id},include:{items:true}});const action=String(x.action);const status=action==="confirm"&&order.status==="DRAFT"?"CONFIRMED":action==="deliver"&&order.status==="CONFIRMED"?"DELIVERED":action==="cancel"&&["DRAFT","CONFIRMED"].includes(order.status)?"CANCELLED":null;if(!status)throw new Error("Invalid order transition");const key="order.branch."+id;let branchId="";if(action==="confirm"){branchId=String(x.branchId||"");await tx.branch.findUniqueOrThrow({where:{id:branchId}});await tx.businessSetting.create({data:{key,value:branchId}})}else if(order.status==="CONFIRMED"){const setting=await tx.businessSetting.findUniqueOrThrow({where:{key}});if(typeof setting.value!=="string")throw new Error("Missing reservation branch");branchId=setting.value}const changed=await tx.salesOrder.updateMany({where:{id,status:order.status},data:{status}});if(changed.count!==1)throw new Error("Order already processed");if(branchId){for(const [productId,qty] of itemQuantities(order.items)){const stock=await tx.stock.findUnique({where:{productId_branchId:{productId,branchId}}});if(!stock)throw new Error("Insufficient stock");if(action==="confirm"){if(stock.qty-stock.reserved<qty)throw new Error("Insufficient stock");await tx.stock.update({where:{id:stock.id},data:{reserved:{increment:qty}}})}else{if(stock.reserved<qty||(action==="deliver"&&stock.qty<qty))throw new Error("Reservation inconsistent");await tx.stock.update({where:{id:stock.id},data:{reserved:{decrement:qty},...(action==="deliver"?{qty:{decrement:qty}}:{})}})}}}await tx.auditLog.create({data:{action:"ORDER_"+status,entity:"SalesOrder",entityId:id,before:{status:order.status},after:{status,branchId}}});return {status}},{isolationLevel:"Serializable"});return NextResponse.json(result)}catch(e){return fail(e instanceof Error&&e.message==="Field edit permission required"?"Forbidden: field edit permission required":e instanceof Error&&(["Invalid item","Invalid order transition","Order already processed","Insufficient stock","Reservation inconsistent","Missing reservation branch"].includes(e.message)||e.message.startsWith("Validation:")||e.message.startsWith("Invalid value:"))?e.message:"Order operation failed. Check records or retry.",e instanceof Error&&e.message==="Field edit permission required"?403:409)}}
