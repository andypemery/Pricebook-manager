import { NextRequest, NextResponse } from "next/server"; import { verifyHubRequest } from "@/lib/hub-auth";
export async function GET(request:NextRequest){ const auth=await verifyHubRequest(request,""); if(!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status}); return NextResponse.json({ok:true,status:"framework-ready"}); }
