export const dynamic="force-dynamic";

import { axiomDefaults } from "@/config/axiom-defaults";

export default function Unavailable(){return <div className="loginWrap"><div className="loginCard"><h1>Portal unavailable</h1><p>This portal is currently unavailable. Contact Axiom support at {axiomDefaults.email.supportEmail}.</p></div></div>}
