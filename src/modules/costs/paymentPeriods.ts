export function periodAmounts(keys:string[], amount:string, amounts?:Record<string,string>) {
  return Object.fromEntries(keys.map((key,index)=>[key,amounts?.[key] ?? (!amounts && index===0 ? amount : '')]));
}
export function periodTotal(amounts:Record<string,string>) {
  return Object.values(amounts).reduce((sum,value)=>sum+(Number.isFinite(Number(value))?Math.round(Number(value)*100):0),0)/100;
}
