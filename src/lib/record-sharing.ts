import type {Prisma} from "@prisma/client";
export type SharingUser={id:string;role:string};
const prefix="setup.jobShare.";
export async function accessibleJobIds(db:Prisma.TransactionClient,user:SharingUser){
 if(user.role!=="TECHNICIAN")return null;
 const [assigned,shared]=await Promise.all([
 db.jobCard.findMany({where:{technicianId:user.id},select:{id:true}}),
 db.businessSetting.findMany({where:{key:{startsWith:prefix},value:{array_contains:[user.id]}},select:{key:true}})
 ]);
 return [...new Set([...assigned.map(job=>job.id),...shared.map(row=>row.key.slice(prefix.length))])];
}
export async function canAccessServiceCase(db:Prisma.TransactionClient,user:SharingUser,caseId:string){
 const jobs=await accessibleJobIds(db,user);
 if(jobs===null)return true;
 if(!jobs.length)return false;
 return !!await db.jobCard.count({where:{caseId,id:{in:jobs}}});
}
export async function canAccessJobCard(db:Prisma.TransactionClient,user:SharingUser,jobId:string){
 const jobs=await accessibleJobIds(db,user);
 return jobs===null||jobs.includes(jobId);
}
export async function canAccessServiceRecord(db:Prisma.TransactionClient,user:SharingUser,entity:string,id:string){
 if(entity==="JobCard")return canAccessJobCard(db,user,id);
 if(entity==="ServiceCase")return canAccessServiceCase(db,user,id);
 return true;
}
