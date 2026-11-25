"use client";

import {createContext,useContext,type ReactNode} from "react";
import {canEditStaffField,canReadStaffField} from "@/lib/staff-field-access";

export type StaffAccess={permissions:string[];fieldPermissions:string[]};

const StaffAccessContext=createContext<StaffAccess|null>(null);

export function StaffAccessProvider({access,children}:{access:StaffAccess;children:ReactNode}){
  return <StaffAccessContext.Provider value={access}>{children}</StaffAccessContext.Provider>;
}

export function useStaffAccess(){
  return staffAccessRules(useContext(StaffAccessContext));
}

export function staffAccessRules(access: StaffAccess | null){
  return {
    access,
    can: (entity:string,action:"READ"|"CREATE"|"EDIT"|"DELETE") =>
      !access||access.permissions.includes(entity+":"+action),
    canRead: (entity:string,field:string) =>
      !access||canReadStaffField(access,entity,field),
    canEdit: (entity:string,field:string) =>
      !access||canEditStaffField(access,entity,field),
  };
}
