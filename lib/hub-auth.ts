import type { NextRequest } from "next/server";
import crypto from "crypto";
export async function verifyHubRequest(request: NextRequest, rawBody: string): Promise<{ok:true}|{ok:false;status:number;error:string}>{
 const secret=process.env.AXIOM_HUB_SHARED_SECRET; if(!secret) return {ok:false,status:503,error:"Hub shared secret is not configured"};
 const appId=request.headers.get("x-axiom-app-id") || ""; const customerId=request.headers.get("x-axiom-customer-id") || ""; const timestamp=request.headers.get("x-axiom-timestamp") || ""; const signature=request.headers.get("x-axiom-signature") || "";
 if(!appId || !customerId || !timestamp || !signature) return {ok:false,status:401,error:"Missing hub signature headers"};
 if(process.env.AXIOM_APP_ID && appId!==process.env.AXIOM_APP_ID) return {ok:false,status:403,error:"App ID mismatch"};
 if(process.env.AXIOM_CUSTOMER_ID && customerId!==process.env.AXIOM_CUSTOMER_ID) return {ok:false,status:403,error:"Customer ID mismatch"};
 const expected=crypto.createHmac("sha256",secret).update(`${appId}.${customerId}.${timestamp}.${rawBody}`).digest("hex");
 if(expected!==signature) return {ok:false,status:401,error:"Invalid signature"}; return {ok:true};
}
