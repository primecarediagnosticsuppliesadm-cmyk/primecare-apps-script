function requestAction(req) {
  if (req.method === "GET") return String(req.query?.action || "").trim();
  const body = req.body && typeof req.body === "object" ? req.body : {};
  return String(body.action || "").trim();
}

export default async function handler(req, res) {
  try {
    const APPS_SCRIPT_URL = process.env.PRIMECARE_APPS_SCRIPT_URL;
    const action = requestAction(req);

    console.log("PrimeCare proxy hit:", {
      method: req.method,
      query: req.query,
      action,
      hasAppsScriptUrl: !!APPS_SCRIPT_URL,
    });

    if (!APPS_SCRIPT_URL) {
      // Production is Supabase-first. Client debug logging must not 500
      // merely because legacy Apps Script is intentionally unset.
      if (action === "logClientError") {
        return res.status(200).json({
          success: true,
          skipped: true,
          reason: "legacy_apps_script_disabled",
        });
      }
      return res.status(410).json({
        success: false,
        error: "Legacy Apps Script is disabled in this environment",
      });
    }

    if (req.method === "GET") {
      const url = new URL(APPS_SCRIPT_URL);

      Object.entries(req.query || {}).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== "") {
          url.searchParams.set(key, value);
        }
      });

      console.log("Forwarding GET to Apps Script:", url.toString());

      const response = await fetch(url.toString(), {
        method: "GET",
      });

      const text = await response.text();

      console.log("Apps Script GET response status:", response.status);
      console.log("Apps Script GET response preview:", text.slice(0, 500));

      return res
        .status(response.ok ? 200 : response.status)
        .setHeader("Content-Type", "application/json")
        .send(text);
    }

    if (req.method === "POST") {
      console.log("Forwarding POST to Apps Script with body:", req.body);

      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
        },
        body: JSON.stringify(req.body || {}),
      });

      const text = await response.text();

      console.log("Apps Script POST response status:", response.status);
      console.log("Apps Script POST response preview:", text.slice(0, 500));

      return res
        .status(response.ok ? 200 : response.status)
        .setHeader("Content-Type", "application/json")
        .send(text);
    }

    return res.status(405).json({
      success: false,
      error: "Method not allowed",
    });
  } catch (err) {
    console.error("PrimeCare proxy error:", err);
    return res.status(500).json({
      success: false,
      error: err.message || "Proxy request failed",
    });
  }
}