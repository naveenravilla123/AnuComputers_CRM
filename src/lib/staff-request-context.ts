export const STAFF_WORKSPACE_HEADER="x-anu-workspace";

export function isStaffWorkspaceRequest(request:Pick<Request,"headers">){
  return request.headers.get(STAFF_WORKSPACE_HEADER)==="staff";
}
