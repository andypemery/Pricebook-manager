import { NextRequest, NextResponse } from "next/server"; import { verifyHubRequest } from "@/lib/hub-auth";
export async function POST(request:NextRequest){ const raw=await request.text(); const auth=await verifyHubRequest(request,raw); if(!auth.ok) return NextResponse.json({error:auth.error},{status:auth.status}); return NextResponse.json({ok:true,received:true}); }
