interface BuildThemeEmailHtmlInput {
  eyebrow: string;
  title: string;
  intro: string;
  actionLabel?: string;
  actionUrl?: string;
  fields?: Array<{ label: string; value: string }>;
  fallbackLabel?: string;
  fallbackValue?: string;
  footer?: string;
}

interface BuildThemeEmailTextInput {
  title: string;
  intro: string;
  actionLabel?: string;
  actionUrl?: string;
  fields?: Array<{ label: string; value: string }>;
  fallbackLabel?: string;
  fallbackValue?: string;
  footer?: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function buildThemeEmailHtml(input: BuildThemeEmailHtmlInput): string {
  const fields = (input.fields ?? [])
    .map(
      (field) => `
      <div class="es-field" style="margin:0 0 12px;padding:12px 14px;border:1px solid #8593a3;border-radius:12px;background:linear-gradient(160deg,rgba(246,250,255,0.74),rgba(229,238,248,0.58));">
        <p class="es-field-label" style="margin:0 0 5px;font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#2f3f52;font-family:'JetBrains Mono','SFMono-Regular',Menlo,monospace;font-weight:700;">${escapeHtml(field.label)}</p>
        <p class="es-field-value" style="margin:0;font-size:14px;line-height:1.55;color:#171d25;font-family:'Syne','Segoe UI',Roboto,Arial,sans-serif;font-weight:700;word-break:break-word;">${escapeHtml(field.value)}</p>
      </div>`
    )
    .join("");

  const action =
    input.actionLabel && input.actionUrl
      ? `<div class="es-action" style="text-align:center;margin:22px 0 18px;"><a href="${escapeHtml(input.actionUrl)}" class="es-action-link" style="display:inline-block;padding:12px 22px;border-radius:10px;background:linear-gradient(90deg,#6f4de6,#5a3dca);color:#f8f6ff;text-decoration:none;font-size:13px;letter-spacing:0.08em;text-transform:uppercase;font-family:'JetBrains Mono','SFMono-Regular',Menlo,monospace;font-weight:700;">${escapeHtml(input.actionLabel)}</a></div>`
      : "";

  const fallback =
    input.fallbackLabel && input.fallbackValue
      ? `<p class="es-fallback-label" style="margin:0 0 8px;font-size:12px;line-height:1.5;color:#2f3f52;font-family:'Syne','Segoe UI',Roboto,Arial,sans-serif;">${escapeHtml(input.fallbackLabel)}</p><p class="es-fallback-value" style="margin:0 0 16px;padding:10px 12px;word-break:break-all;font-size:12px;line-height:1.65;color:#171d25;background:#eef3f8;border:1px solid #8593a3;border-radius:10px;font-family:'JetBrains Mono','SFMono-Regular',Menlo,monospace;">${escapeHtml(input.fallbackValue)}</p>`
      : "";

  const footer = input.footer
    ? `<p class="es-footer" style="margin:0;font-size:12px;line-height:1.6;color:#c94c52;font-family:'Syne','Segoe UI',Roboto,Arial,sans-serif;">${escapeHtml(input.footer)}</p>`
    : "";

  return `
    <div class="es-shell" style="margin:0;padding:28px 14px;background:#f1f4f8;background-image:radial-gradient(at 0% 0%,rgba(184,164,122,0.1) 0,transparent 60%),radial-gradient(at 100% 0%,rgba(171,147,114,0.08) 0,transparent 62%),radial-gradient(at 100% 100%,rgba(156,138,110,0.08) 0,transparent 64%),radial-gradient(at 0% 100%,rgba(176,156,121,0.08) 0,transparent 62%);font-family:'Syne','Segoe UI',Roboto,Arial,sans-serif;color:#171d25;-webkit-text-size-adjust:100%;">
      <style>
        @media only screen and (max-width: 620px) {
          .es-shell { padding: 16px 8px !important; }
          .es-card { border-radius: 12px !important; }
          .es-header { padding: 14px 14px !important; }
          .es-header-brand { font-size: 23px !important; }
          .es-header-tagline { letter-spacing: 0.14em !important; }
          .es-body { padding: 16px 14px 16px !important; }
          .es-title { font-size: 29px !important; line-height: 1.02 !important; }
          .es-intro { font-size: 13px !important; line-height: 1.58 !important; }
          .es-field { padding: 10px 11px !important; margin-bottom: 10px !important; }
          .es-field-label { font-size: 10px !important; }
          .es-field-value { font-size: 13px !important; }
          .es-action { margin: 16px 0 14px !important; }
          .es-action-link { display: block !important; width: 100% !important; box-sizing: border-box !important; text-align: center !important; }
          .es-fallback-value { font-size: 11px !important; line-height: 1.55 !important; }
          .es-footer { font-size: 11px !important; }
        }
      </style>
      <table role="presentation" class="es-card" style="width:100%;max-width:640px;margin:0 auto;border-collapse:collapse;background:rgba(255,255,255,0.85);border:1px solid #8593a3;border-radius:16px;overflow:hidden;box-shadow:0 20px 38px rgba(23,29,37,0.14);">
        <tr>
          <td class="es-header" style="padding:18px 24px;border-bottom:1px solid rgba(133,147,163,0.38);background:linear-gradient(180deg,rgba(238,243,248,0.92),rgba(244,247,250,0.92));">
            <p style="margin:0;font-size:10px;letter-spacing:0.24em;text-transform:uppercase;color:#6f4de6;font-family:'JetBrains Mono','SFMono-Regular',Menlo,monospace;font-weight:700;">${escapeHtml(input.eyebrow)}</p>
            <p class="es-header-brand" style="margin:8px 0 0;font-size:26px;line-height:0.95;letter-spacing:0.06em;color:#171d25;font-family:'Bebas Neue','Arial Narrow',Arial,sans-serif;font-weight:400;">EtherSend</p>
            <p class="es-header-tagline" style="margin:4px 0 0;font-size:10px;letter-spacing:0.2em;text-transform:uppercase;color:#2f3f52;font-family:'JetBrains Mono','SFMono-Regular',Menlo,monospace;font-weight:700;">Send it. Control it. Make it disappear.</p>
          </td>
        </tr>
        <tr>
          <td class="es-body" style="padding:24px 24px 22px;background:rgba(244,247,250,0.78);">
            <h1 class="es-title" style="margin:0 0 10px;font-size:34px;line-height:0.96;letter-spacing:0.04em;color:#171d25;font-family:'Bebas Neue','Arial Narrow',Arial,sans-serif;font-weight:400;">${escapeHtml(input.title)}</h1>
            <p class="es-intro" style="margin:0 0 14px;font-size:14px;line-height:1.68;color:#2f3f52;font-family:'Syne','Segoe UI',Roboto,Arial,sans-serif;">${escapeHtml(input.intro)}</p>
            ${fields}
            ${action}
            ${fallback}
            ${footer}
          </td>
        </tr>
      </table>
    </div>
  `.trim();
}

export function buildThemeEmailText(input: BuildThemeEmailTextInput): string {
  const fields = (input.fields ?? []).map((field) => `${field.label}: ${field.value}`);
  const lines = [input.title, "", input.intro, "", ...fields];

  if (input.actionLabel && input.actionUrl) {
    lines.push("", `${input.actionLabel}: ${input.actionUrl}`);
  }

  if (input.fallbackLabel && input.fallbackValue) {
    lines.push("", `${input.fallbackLabel}: ${input.fallbackValue}`);
  }

  if (input.footer) {
    lines.push("", input.footer);
  }

  return lines.join("\n");
}
