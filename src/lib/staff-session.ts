import {randomBytes,createHash} from "node:crypto";
import {prisma} from "@/lib/prisma";
import {resolveStaffPermissions} from "@/lib/permissions";
const digest=(s:string)=>createHash("sha256").update(s).digest("hex");
export async function issueStaffSession(id:string){const token=randomBytes(32).toString("hex");const credential=await prisma.businessSetting.findUniqueOrThrow({where:{key:"auth.staff."+id}});await prisma.businessSetting.create({data:{key:"auth.session."+digest(token),value:{id,expires:Date.now()+8*3600000,credentialVersion:digest(JSON.stringify(credential.value))}}});return token}
export async function getStaffSession(token:string|undefined){if(!token||!/^[a-f0-9]{64}$/.test(token))return null;const row=await prisma.businessSetting.findUnique({where:{key:"auth.session."+digest(token)}});const v=row?.value as {id?:string;expires?:number;credentialVersion?:string}|null;if(!v?.id||!v.expires||v.expires<=Date.now())return null;const credential=await prisma.businessSetting.findUnique({where:{key:"auth.staff."+v.id}});if(!credential||digest(JSON.stringify(credential.value))!==v.credentialVersion)return null;return resolveStaffPermissions(v.id)}
export async function revokeStaffSession(token:string|undefined){if(token&&/^[a-f0-9]{64}$/.test(token))await prisma.businessSetting.deleteMany({where:{key:"auth.session."+digest(token)}})}
