/* ============================================================
   §SANITIZE  Write-time text sanitizer  (Phase E — S26)
   ============================================================
   Defence-in-depth for stored XSS: free-text the user can write (notes,
   comments, project salients) is sanitized at the WRITE boundary — HTML tags
   and stray angle brackets removed, control chars stripped, length-capped — so
   the value can never carry an executable tag regardless of which render path
   prints it. Render-time escapeHtml stays in place as the second layer; because
   sanitized text contains no <>, there is no double-encoding.
   ============================================================ */

function _sanitizeText(s, maxLen) {
  if (s == null) return '';
  var t = String(s);
  t = t.replace(/<[^>]*>/g, '');                                          // strip HTML tags
  t = t.replace(/[<>]/g, '');                                             // strip stray angle brackets
  t = t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');   // control chars (keep \t \n \r)
  if (maxLen && t.length > maxLen) t = t.slice(0, maxLen);
  return t;
}
