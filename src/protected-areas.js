export function currentPilotProtection(session) {
  return session?.pilot_protection_versions?.at(-1)||{version:0,areas:[],change:null};
}

export const protectionVersionChanged=(snapshot,session)=>(snapshot?.protection_version??0)!==currentPilotProtection(session).version;

export function protectionMatchesArea(protection,area) {
  return protection.version===0?protection.areas.length===0:protection.area_sha256===area.sha256&&protection.areas.every(a=>a.area_sha256===area.sha256&&
    Array.isArray(a.bounds_utm)&&a.bounds_utm.length===4&&a.bounds_utm.every(Number.isSafeInteger)&&
    a.bounds_utm[0]<a.bounds_utm[2]&&a.bounds_utm[1]<a.bounds_utm[3]&&a.bounds_utm[0]>=area.bounds_utm[0]&&a.bounds_utm[1]>=area.bounds_utm[1]&&
    a.bounds_utm[2]<=area.bounds_utm[2]&&a.bounds_utm[3]<=area.bounds_utm[3]);
}

// Intersect in the registered metre CRS. Shared edges do not occupy protected land.
export function protectionConflicts(bounds,areas=[]) {
  if(!Array.isArray(bounds)||bounds.length!==4)return [];
  return areas.flatMap(area=>{
    const b=area.bounds_utm;
    const overlap=Math.max(0,Math.min(bounds[2],b[2])-Math.max(bounds[0],b[0]))*
      Math.max(0,Math.min(bounds[3],b[3])-Math.max(bounds[1],b[1]));
    return overlap>0?[{id:area.id,label:area.label,overlap_m2:overlap}]:[];
  });
}
