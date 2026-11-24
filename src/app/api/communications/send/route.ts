import {NextRequest,NextResponse} from "next/server";
import {prisma} from "@/lib/prisma";
import {authorizeAll} from "@/lib/request-access";
import {canEditStaffField,canReadStaffFields} from "@/lib/staff-field-access";

export async function POST(r:NextRequest){
 const auth=await authorizeAll(r,[{object:"Communication",action:"EDIT"},{object:"Customer",action:"READ"}]);
 if(!auth.allowed)return NextResponse.json({error:auth.status===401?"Unauthorized":"Forbidden"},{status:auth.status});
 if(r.headers.get("origin")!==r.nextUrl.origin)return NextResponse.json({error:"Invalid origin"},{status:403});
 if(auth.access.kind==="staff"&&(!canReadStaffFields(auth.access.user,[["Communication","channel"],["Communication","recipient"],["Communication","template"],["Communication","status"],["Communication","externalId"],["Customer","phone"]])||!canEditStaffField(auth.access.user,"Communication","status")||!canEditStaffField(auth.access.user,"Communication","externalId")))return NextResponse.json({error:"Forbidden"},{status:403});

 const token=process.env.WHATSAPP_ACCESS_TOKEN,phone=process.env.WHATSAPP_PHONE_NUMBER_ID,version=process.env.WHATSAPP_GRAPH_VERSION,language=process.env.WHATSAPP_TEMPLATE_LANGUAGE||"en";
 if(!token||!phone||!version||!/^v\d+\.\d+$/.test(version)||!/^\d+$/.test(phone))return NextResponse.json({error:"WhatsApp provider is not configured"},{status:503});
 let id="",claimed=false;
 try{
  const x=await r.json();
  id=String(x.id||"");
  const row=await prisma.communication.findUnique({where:{id}});
  if(!row||row.channel!=="WHATSAPP"||row.status!=="QUEUED"||!row.template||!/^[a-z0-9_]+$/.test(row.template))return NextResponse.json({error:"Queued approved template required"},{status:409});
  const link=(await prisma.businessSetting.findUnique({where:{key:"wa.message."+id}}))?.value as {customerId?:string}|undefined;
  if(link?.customerId){
   const consent=(await prisma.businessSetting.findUnique({where:{key:"wa.consent."+link.customerId}}))?.value as {enabled?:boolean;recipient?:string}|undefined;
   const customer=await prisma.customer.findUnique({where:{id:link.customerId}});
   const customerPhone=customer?.phone.replace(/[\s+-]/g,"")||"";
   if(!consent?.enabled||consent.recipient!==row.recipient||(customerPhone.length===10?"91"+customerPhone:customerPhone)!==row.recipient)return NextResponse.json({error:"Consent revoked or phone changed"},{status:403});
  }
  const changed=await prisma.communication.updateMany({where:{id,status:"QUEUED"},data:{status:"SENDING"}});
  if(changed.count!==1)return NextResponse.json({error:"Already processed"},{status:409});
  claimed=true;
  const response=await fetch("https://graph.facebook.com/"+version+"/"+phone+"/messages",{
   method:"POST",
   headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({messaging_product:"whatsapp",to:row.recipient,type:"template",template:{name:row.template,language:{code:language}}}),
   signal:AbortSignal.timeout(15000)
  });
  const result=await response.json();
  const externalId=result.messages?.[0]?.id;
  if(!response.ok||!externalId){
   await prisma.communication.update({where:{id},data:{status:response.status>=500?"UNKNOWN":"FAILED"}});
   return NextResponse.json({error:"Provider did not confirm acceptance"},{status:502});
  }
  await prisma.communication.update({where:{id},data:{status:"ACCEPTED",externalId}});
  return NextResponse.json({status:"ACCEPTED"});
 }catch{
  if(claimed&&id)await prisma.communication.updateMany({where:{id,status:"SENDING"},data:{status:"UNKNOWN"}}).catch(()=>{});
  return NextResponse.json({error:"Dispatch outcome uncertain; verify with provider before sending again"},{status:502});
 }
}
