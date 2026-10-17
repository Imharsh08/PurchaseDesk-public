/** Minimal RFC 5322 / MIME builder for the Gmail API (plain text, optional HTML, attachments). */

export type MailAttachment = { filename: string; content: Uint8Array; contentType: string };

export type MailMessage = {
  from: { name: string; email: string };
  to: string[];
  cc?: string[];
  replyTo?: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: MailAttachment[];
};

const ascii = (s: string) => /^[\x20-\x7e]*$/.test(s);
/** RFC 2047 encoded-word for non-ASCII header text. */
export const encodeHeader = (s: string) => (ascii(s) ? s : `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`);
const wrap = (b64: string) => b64.replace(/.{1,76}/g, "$&\r\n").trimEnd();
const base64 = (data: string | Uint8Array) => wrap(Buffer.from(data).toString("base64"));
const cleanAddress = (s: string) => s.replace(/[\r\n<>"]/g, "").trim();
const quoteName = (name: string) => (ascii(name) ? `"${name.replace(/["\\\r\n]/g, "")}"` : encodeHeader(name));

export function buildMime(m: MailMessage, boundarySeed = Math.random().toString(36).slice(2)) {
  const mixed = `mix_${boundarySeed}`;
  const alt = `alt_${boundarySeed}`;
  const headers = [
    `From: ${quoteName(m.from.name)} <${cleanAddress(m.from.email)}>`,
    `To: ${m.to.map(cleanAddress).join(", ")}`,
    ...(m.cc?.length ? [`Cc: ${m.cc.map(cleanAddress).join(", ")}`] : []),
    ...(m.replyTo ? [`Reply-To: ${cleanAddress(m.replyTo)}`] : []),
    `Subject: ${encodeHeader(m.subject.replace(/[\r\n]+/g, " "))}`,
    "MIME-Version: 1.0",
  ];

  const textPart = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", base64(m.text)].join("\r\n");
  const body = m.html
    ? [
        `Content-Type: multipart/alternative; boundary="${alt}"`,
        "",
        `--${alt}`,
        textPart,
        `--${alt}`,
        ["Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", base64(m.html)].join("\r\n"),
        `--${alt}--`,
      ].join("\r\n")
    : textPart;

  if (!m.attachments?.length) return [...headers, body].join("\r\n");

  const parts = [
    `--${mixed}`,
    body,
    ...m.attachments.flatMap((a) => {
      const name = encodeHeader(a.filename.replace(/["\r\n]/g, "_"));
      return [
        `--${mixed}`,
        [
          `Content-Type: ${a.contentType}; name="${name}"`,
          `Content-Disposition: attachment; filename="${name}"`,
          "Content-Transfer-Encoding: base64",
          "",
          base64(a.content),
        ].join("\r\n"),
      ];
    }),
    `--${mixed}--`,
  ];
  return [...headers, `Content-Type: multipart/mixed; boundary="${mixed}"`, "", ...parts].join("\r\n");
}

/** What the Gmail API's users.messages.send expects in `raw`. */
export function toGmailRaw(mime: string) {
  return Buffer.from(mime, "utf8").toString("base64url");
}
