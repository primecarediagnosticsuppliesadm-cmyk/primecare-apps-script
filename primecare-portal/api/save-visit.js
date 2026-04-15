export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  try {
    const appsScriptUrl =
      "https://script.google.com/macros/s/AKfycbzBV1N2Ae3PZttnMcJ4YdUiljYf3cHPMrQo129kTDv0I57gNQwcHduCCXx58qJ_OKf43w/exec?action=saveAgentVisit";

    const response = await fetch(appsScriptUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(req.body),
    });

    const text = await response.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      data = { success: false, error: text || "Invalid response from Apps Script" };
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.message || "Proxy request failed",
    });
  }
}