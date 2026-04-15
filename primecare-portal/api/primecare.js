export default async function handler(req, res) {
  try {
    const APPS_SCRIPT_URL = process.env.PRIMECARE_APPS_SCRIPT_URL;

    console.log("PrimeCare proxy hit:", {
      method: req.method,
      query: req.query,
      hasAppsScriptUrl: !!APPS_SCRIPT_URL,
    });

    if (!APPS_SCRIPT_URL) {
      console.error("Missing PRIMECARE_APPS_SCRIPT_URL");
      return res.status(500).json({
        success: false,
        error: "Missing PRIMECARE_APPS_SCRIPT_URL environment variable",
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