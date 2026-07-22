// AI-coach (testpaneel, alleen platform_admin): chatten met Claude over het
// geanonimiseerde trainingsarchief (tabel ai_archief, 60k regels van 73
// atleten, namen vervangen door "Atleet NN"). De AI kan zelf in het archief
// zoeken via tools; de sleutel ANTHROPIC_API_KEY staat als Supabase-secret.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, content-type, apikey",
};
const json = (status: number, obj: unknown) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors, "Content-Type": "application/json" } });

const MODEL = "claude-opus-4-8";
const MAX_RONDES = 6;
// Prijzen per miljoen tokens (Opus 4.8) voor de kostenschatting in het paneel.
const PRIJS = { in: 5, uit: 25, cacheSchrijf: 6.25, cacheLees: 0.5 };

const SYSTEEM = `Je bent de AI-coach van YourProgram, een online CrossFit- en Hyrox-coachingbedrijf uit Nederland. Je sparringpartner is de coach zelf (niet de sporter). Je helpt met analyseren en programmeren: krachtblokken, metcons, periodisering, werken rond blessures.

Je hebt via tools toegang tot een geanonimiseerd trainingsarchief: twee jaar echte programmering van 73 atleten ("Atleet 01" t/m "Atleet 73"), met per blok het voorschrift, het gelogde resultaat en de notities van coach en atleet. Gebruik dat archief actief: zoek eerst naar vergelijkbare gevallen of naar de historie van een atleet voordat je programmeert, en verwijs ernaar ("bij Atleet 07 werkte ..."). De stijl van het archief is de stijl van dit bedrijf: neem die over (opbouw in blokken A/B1/B2/C, tempo-notatie zoals 30X0, procenten van 1RM, duidelijke coachnotities met *).

Regels:
- Antwoord in het Nederlands. Wees concreet en to the point; een coach heeft niets aan algemene fitnesspraat.
- Programma's lever je per dag, met blokken (A, B, C ...), per blok de oefening, het voorschrift (sets x reps @ tempo, rust) en waar zinvol een korte coachnotitie. Geef bij een meerdaags programma ook één alinea uitleg over de opbouw en waarom.
- Noem nooit echte namen; het archief kent alleen atleet-codes.
- Als de vraag te weinig context geeft (niveau, doel, beschikbare dagen, beperkingen), stel dan eerst 2-3 gerichte vragen in plaats van te gokken.
- Wees eerlijk over onzekerheid en over wat niet in het archief te vinden is.`;

const TOOLS = [
  {
    name: "zoek_archief",
    description: "Zoek in het trainingsarchief op trefwoord (oefening, blessure, term zoals 'schouder' of 'ring muscle up'). Geeft losse programmablokken terug met voorschrift en gelogd resultaat. Gebruik korte, enkelvoudige zoektermen en zoek gerust meerdere keren met verschillende termen.",
    input_schema: {
      type: "object",
      properties: {
        zoekterm: { type: "string", description: "Trefwoord om op te zoeken (in oefening en tekst)" },
        atleet: { type: "string", description: "Optioneel: beperk tot één atleet, bijv. 'Atleet 07'" },
      },
      required: ["zoekterm"],
    },
  },
  {
    name: "atleet_overzicht",
    description: "Overzicht van alle atleten in het archief: code, aantal geprogrammeerde blokken en de periode. Handig als startpunt om een passende casus te vinden.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "atleet_historie",
    description: "De recentste programmering van één atleet, chronologisch (nieuwste onderaan). Gebruik dit om iemands opbouw en belastbaarheid te zien voordat je verder programmeert.",
    input_schema: {
      type: "object",
      properties: {
        atleet: { type: "string", description: "Atleet-code, bijv. 'Atleet 07'" },
        aantal: { type: "number", description: "Aantal blokken (standaard 60, max 120)" },
      },
      required: ["atleet"],
    },
  },
];

// Compact tekstformaat voor archiefregels; teksten afkappen zodat één
// zoekactie niet de hele context volpompt.
type Rij = { atleet: string; datum: string | null; dag: string | null; blok: string | null; oefening: string | null; tekst: string | null };
const rijTxt = (r: Rij) =>
  `${r.atleet} · ${r.datum ?? "?"} ${r.dag ?? ""} · ${r.blok ?? ""}) ${r.oefening ?? ""}\n${(r.tekst ?? "").slice(0, 700)}`;

async function voerToolUit(db: ReturnType<typeof createClient>, naam: string, input: Record<string, unknown>): Promise<string> {
  if (naam === "zoek_archief") {
    const term = String(input.zoekterm ?? "").trim();
    if (!term) return "Lege zoekterm.";
    let q = db.from("ai_archief")
      .select("atleet,datum,dag,blok,oefening,tekst")
      .or(`oefening.ilike.%${term.replace(/[%,()]/g, "")}%,tekst.ilike.%${term.replace(/[%,()]/g, "")}%`)
      .order("atleet").order("volg")
      .limit(40);
    if (input.atleet) q = q.eq("atleet", String(input.atleet));
    const { data, error } = await q;
    if (error) return "Zoeken mislukt: " + error.message;
    if (!data?.length) return `Niets gevonden voor "${term}".`;
    return `${data.length} treffers voor "${term}" (max 40):\n\n` + data.map((r) => rijTxt(r as Rij)).join("\n---\n");
  }
  if (naam === "atleet_overzicht") {
    const { data, error } = await db.rpc("ai_archief_overzicht");
    if (error) return "Overzicht mislukt: " + error.message;
    return (data as { atleet: string; blokken: number; van: string; tot: string }[])
      .map((r) => `${r.atleet}: ${r.blokken} blokken (${r.van} t/m ${r.tot})`).join("\n");
  }
  if (naam === "atleet_historie") {
    const atleet = String(input.atleet ?? "");
    const aantal = Math.min(Number(input.aantal) || 60, 120);
    const { data, error } = await db.from("ai_archief")
      .select("atleet,datum,dag,blok,oefening,tekst")
      .eq("atleet", atleet)
      .order("volg", { ascending: false })
      .limit(aantal);
    if (error) return "Historie mislukt: " + error.message;
    if (!data?.length) return `Geen data voor "${atleet}".`;
    return `Recentste ${data.length} blokken van ${atleet} (nieuwste onderaan):\n\n` +
      data.reverse().map((r) => rijTxt(r as Rij)).join("\n---\n");
  }
  return "Onbekende tool.";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "alleen POST" });

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Alleen ingelogde platform_admins (het paneel is een admin-test).
  const jwt = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: u } = await db.auth.getUser(jwt);
  if (!u?.user) return json(401, { error: "niet ingelogd" });
  const { data: prof } = await db.from("profiles").select("role").eq("id", u.user.id).single();
  if (prof?.role !== "platform_admin") return json(403, { error: "alleen voor platform-admins" });

  const sleutel = Deno.env.get("ANTHROPIC_API_KEY");
  if (!sleutel) return json(200, { error: "geen_sleutel" });

  const body = await req.json().catch(() => null);
  const gesprek = body?.messages;
  if (!Array.isArray(gesprek) || !gesprek.length) return json(400, { error: "geen berichten" });

  // Gesprek naar API-vorm; alleen role+content doorlaten.
  const messages: { role: string; content: unknown }[] = gesprek
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content)
    .map((m) => ({ role: m.role, content: String(m.content).slice(0, 20000) }));

  const usage = { in: 0, uit: 0, cacheSchrijf: 0, cacheLees: 0 };
  let rondes = 0;
  let laatste: { content?: { type: string; [k: string]: unknown }[]; stop_reason?: string } | null = null;

  for (let i = 0; i < MAX_RONDES; i++) {
    rondes++;
    const r = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": sleutel,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8000,
        thinking: { type: "adaptive" },
        system: [{ type: "text", text: SYSTEEM, cache_control: { type: "ephemeral" } }],
        tools: TOOLS,
        messages,
      }),
    });
    const antwoord = await r.json();
    if (!r.ok) {
      return json(200, { error: "api_fout", detail: antwoord?.error?.message ?? ("HTTP " + r.status) });
    }
    laatste = antwoord;
    if (antwoord.usage) {
      usage.in += antwoord.usage.input_tokens ?? 0;
      usage.uit += antwoord.usage.output_tokens ?? 0;
      usage.cacheSchrijf += antwoord.usage.cache_creation_input_tokens ?? 0;
      usage.cacheLees += antwoord.usage.cache_read_input_tokens ?? 0;
    }
    if (antwoord.stop_reason !== "tool_use") break;

    // Tools uitvoeren en alle resultaten in één user-beurt terugsturen.
    messages.push({ role: "assistant", content: antwoord.content });
    const results: { type: string; tool_use_id: string; content: string }[] = [];
    for (const blok of antwoord.content ?? []) {
      if (blok.type !== "tool_use") continue;
      let uit = "";
      try { uit = await voerToolUit(db, blok.name as string, (blok.input ?? {}) as Record<string, unknown>); }
      catch (e) { uit = "Tool-fout: " + String(e); }
      results.push({ type: "tool_result", tool_use_id: blok.id as string, content: uit });
    }
    messages.push({ role: "user", content: results });
  }

  const tekst = (laatste?.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  const usd = (usage.in * PRIJS.in + usage.uit * PRIJS.uit + usage.cacheSchrijf * PRIJS.cacheSchrijf + usage.cacheLees * PRIJS.cacheLees) / 1e6;

  return json(200, {
    antwoord: tekst || "(geen tekst in het antwoord)",
    afgekapt: laatste?.stop_reason === "tool_use" ? true : false,
    rondes,
    usage,
    usd: Math.round(usd * 10000) / 10000,
  });
});
